/**
 * @license
 * Copyright (c) 2017 CANDY LINE INC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*jslint bitwise: true */
'use strict';

import 'source-map-support/register';
import {
  COAP_ERROR,
  LWM2M_OBJECT_ID,
  LWM2M_TYPE,
  ACL,
} from './object-common';
import deviceObject from './object-device';

const DEFAULT_REPO = {
  DEVICE: deviceObject,
};

class Resource {

  constructor(id, type=LWM2M_TYPE.UNDEFINED, acl=ACL.ALL, value=null) {
    if (typeof(id) === 'object') {
      this.id = id.id;
      this.type = LWM2M_TYPE.toType(id.type);
      this.acl = id.acl || ACL.ALL;
      this.value = id.value;
    } else {
      this.id = id;
      this.type = LWM2M_TYPE.toType(type);
      this.acl = acl || ACL.ALL;
      this.value = value;
    }
  }

  serialize(/* Buffer */ input) {
    if (!ACL.isAllowed(this.acl, ACL.READABLE)) {
      return input;
    }
    let buf = [];
    buf.push(this.id & 0xff);         // ResourceId LSB
    buf.push((this.id >> 8) & 0xff);  // ResourceId MSB
    buf.push(this.type);              // Data Type
    let value = Buffer.from([]);
    switch (this.type) {
      case LWM2M_TYPE.STRING:
      case LWM2M_TYPE.INTEGER:  // strtoll:int64_t
      case LWM2M_TYPE.FLOAT:    // strtod:double
        value = Buffer.from(String(this.value || ''));
        break;
      case LWM2M_TYPE.OPAQUE:
        if (Buffer.isBuffer(this.value)) {
          value = this.value;
        } else {
          let input = String(this.value);
          let type = input.split(':')[0] || '';
          type = (type.toLowerCase() === 'base64') ? 'base64' : 'hex';
          value = Buffer.from(input, type);
        }
        break;
      case LWM2M_TYPE.BOOLEAN:
        value = Buffer.from([this.value ? 1 : 0]);
        break;
      case LWM2M_TYPE.OBJECT_LINK:
        if (typeof(this.value.objectId) === 'undefined' ||
            typeof(this.value.instanceId) === 'undefined') {
          throw new Error(`Invalid Data Type. Either objectId or instanceId is missing`);
        }
        value = Buffer.from([
          this.value.objectId & 0xff,          // Object ID LSB
          (this.value.objectId >> 8) & 0xff,   // Object ID MSB
          this.value.instanceId & 0xff,        // Instance ID LSB
          (this.value.instanceId >> 8) & 0xff, // Instance ID MSB
        ]);
        break;
      case LWM2M_TYPE.MULTIPLE_RESOURCE:
        this.value.forEach((r) => {
          value = r.serialize(value);
        });
        break;
      default:
        throw { status: COAP_ERROR.COAP_501_NOT_IMPLEMENTED };
    }
    buf.push(value.length & 0xff);        // Value Length LSB
    buf.push((value.length >> 8) & 0xff); // Value Length MSB
    return Buffer.concat([input, Buffer.from(buf), value]);
  }

  // invoked by JSON.stringify()
  toJSON() {
    return {
      type: LWM2M_TYPE.toString(this.type),
      acl: this.acl,
      value: this.value
    };
  }

  static build(id, type=LWM2M_TYPE.UNDEFINED, acl=ACL.ALL, value=null) {
    return new Resource(id, type, acl, value);
  }
}

export class ResourceRepositoryBuilder {
  constructor(json=DEFAULT_REPO) {
    this.json = json;
  }

  static toResource(resource) {
    switch (typeof(resource)) {
      case 'string':
        resource = Resource.build({
          type: 'STRING',
          value: resource
        });
        break;
      case 'number':
        resource = Resource.build({
          type: (String(resource).indexOf('.') >= 0) ? 'FLOAT' : 'INTEGER',
          value: resource
        });
        break;
      case 'boolean':
        resource = Resource.build({
          type: (String(resource).indexOf('.') >= 0) ? 'FLOAT' : 'INTEGER',
          value: resource
        });
        break;
      default:
        if (Array.isArray(resource)) {
          resource = Resource.build({
            type: 'MULTIPLE_RESOURCE',
            value: resource.map((r) => ResourceRepositoryBuilder.toResource(r))
          });
        } else {
          resource = Resource.build(resource);
        }
    }
    return resource;
  }

  build() {
    let repo = {};
    Object.keys(this.json).forEach((objectId) => {
      let instances = this.json[objectId];
      if (typeof(instances) !== 'object') {
        return;
      }
      objectId = LWM2M_OBJECT_ID.toType(objectId);
      Object.keys(instances).forEach((instanceId) => {
        let resources = instances[instanceId];
        if (typeof(resources) !== 'object') {
          return;
        }
        let uriBase = `/${objectId}/${instanceId}`;
        Object.keys(resources).forEach((resourceId) => {
          let resource = ResourceRepositoryBuilder.toResource(resources[resourceId]);
          let uri = `${uriBase}/${resourceId}`;
          resource.id = resourceId;
          repo[uri] = resource;
        });
      });
    });

    repo.toJSONString = () => {
      let obj = {};
      Object.keys(repo).forEach((uri) => {
        let ids = uri.split('/').splice(1);
        let objectId = ids[0];
        if (isNaN(parseInt(objectId))) {
          return;
        }
        objectId = LWM2M_OBJECT_ID.toString(objectId);
        let instanceId = ids[1];
        if (isNaN(parseInt(instanceId))) {
          return;
        }
        let resourceId = ids[2];
        if (isNaN(parseInt(resourceId))) {
          return;
        }
        if (!obj[objectId]) {
          obj[objectId] = {};
        }
        if (!obj[objectId][instanceId]) {
          obj[objectId][instanceId] = {};
        }
        obj[objectId][instanceId][resourceId] = repo[uri];
      });
      return JSON.stringify(obj);
    };
    return repo;
  }
}

export class RequestHandler {

  constructor(client, command, payload) {
    this.client = client;
    this.command = command;
    this.payload = payload;
    if (!payload || payload.length < 8) {
      return;
    }
    if (payload[0] === 0x01) {
      this.isRequest = true;
    } else if (payload[0] === 0x02) {
      this.isRequest = false;
    }
    this.messageId = payload[1];
    this.objectId = payload[2] + ((payload[3] << 8) & 0xff00);
    this.instanceId = payload[4] + ((payload[5] << 8) & 0xff00);
    this.resourceLen = payload[6] + ((payload[7] << 8) & 0xff00);
    this.resources = {};

    this.response = Buffer.concat([
      Buffer.from([
        0x02, // response data type
        this.messageId,
        COAP_ERROR.COAP_NO_ERROR // result status code
      ]),
      payload.slice(2, 8) // truncate incoming resouce blocks
    ]);
  }

  toJSONString() {
    return JSON.stringify(this, (key, value) => {
      if (key === 'client') {
        return undefined;
      }
      return value;
    });
  }

  setStatus(code) {
    this.response[2] = code & 0xff;
  }

  getStatus() {
    return this.response[2];
  }

  setResourceLen(len) {
    this.response[7] = len & 0xff;
    this.response[8] = (len >> 8) & 0xff;
  }

  buildResponse() {
    let len = 0;
    let res = Buffer.from([]);
    Object.keys(this.resources).forEach((key) => {
      let r = this.resources[key];
      if (r instanceof Resource) {
        try {
          let out = r.serialize(res);
          if (out !== res) {
            res = out;
            ++len;
            this.client.log(`[buildResponse] key=>${key}, r=>${JSON.stringify(r)}`);
          }
        } catch (e) {
          this.setStatus(e.status || COAP_ERROR.COAP_500_INTERNAL_SERVER_ERROR);
          if (!e.status) {
            this.client.log(e);
          }
        }
      }
    });
    this.response = Buffer.concat([this.response, res]);
    this.setResourceLen(len);
  }

  perform() {
    let resp = `/resp:${this.command}:${this.response.toString('base64')}`;
    return Promise.resolve({
      status: this.getStatus(),
      payload: resp
    });
  }
}

class BadRequest extends RequestHandler {

  constructor(client, command) {
    super(client, command, []);
    this.setStatus(COAP_ERROR.COAP_400_BAD_REQUEST);
  }

}

class Read extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
    let res = [];
    for (let i = 0; i < this.resourceLen; i++) {
      let idx = 8 + i * 2;
      let id = payload[idx] + ((payload[idx + 1] << 8) & 0xff00);
      res.push(new Resource(id));
    }
    this.uris = res.map((resource) => {
      let uri = `/${this.objectId}/${this.instanceId}/${resource.id}`;
      this.resources[uri] = resource;
      return uri;
    });
    super.setStatus(COAP_ERROR.COAP_205_CONTENT);
  }

  perform() {
    return this.client.objectStore.remoteGet(this.uris).then((resources) => {
      let keys = Object.keys(resources);
      let resouceLen = keys.length;
      if (resouceLen === 0) {
        super.setStatus(COAP_ERROR.COAP_404_NOT_FOUND);
        return super.perform();
      } else if (resouceLen === 1) {
        if (!ACL.isAllowed(resources[keys[0]].acl, ACL.READABLE)) {
          this.setStatus(COAP_ERROR.COAP_405_METHOD_NOT_ALLOWED);
          return super.perform();
        }
      }
      // build response
      this.resources = resources || {};
      super.buildResponse();
      return super.perform();
    });
  }

}

RequestHandler.build = (client, command, payload) => {
  switch (command) {
    case 'read':
      return new Read(client, command, payload);
    default:
      return new BadRequest(client, command);
  }
};
