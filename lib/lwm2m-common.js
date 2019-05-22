/**
 * @license
 * Copyright (c) 2019 CANDY LINE INC.
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
import cproc from 'child_process';
import path from 'path';
import binary from 'node-pre-gyp';
import { EventEmitter } from 'events';
import {
  COAP_ERROR,
  LWM2M_OBJECT_ID,
  LWM2M_TYPE,
  ACL,
} from './object-common';
import securityObject from './object-security';
import serverObject from './object-server';
import aclObject from './object-acl';
import deviceObject from './object-device';

// pointing to .node file
const BINDING_PATH = binary.find(path.resolve(path.join(__dirname, '..', 'package.json')));
const CLIENT_PATH = path.resolve(BINDING_PATH, '..');

const DEFAULT_REPO = {
  '0': securityObject,
  '1': serverObject,
  '2': aclObject,
  '3': deviceObject,
};

// https://hackernoon.com/functional-javascript-resolving-promises-sequentially-7aac18c4431e
const promiseSerial = promises =>
  promises.reduce((promise, p) =>
    promise.then(result => p.then(Array.prototype.concat.bind(result))),
    Promise.resolve([]));

export class Resource {

  constructor(id, type=LWM2M_TYPE.UNDEFINED, acl=ACL.READABLE, value=null, sensitive=null) {
    if (typeof(id) === 'object') {
      this.id = id.id;
      this.type = LWM2M_TYPE.toType(id.type);
      this.acl = ACL.toValue(id.acl);
      this.value = id.value;
      this.sensitive = (id.sensitive === undefined || id.sensitive === null) ? undefined : !!id.sensitive;
    } else {
      this.id = id;
      this.type = LWM2M_TYPE.toType(type);
      this.acl = ACL.toValue(acl);
      this.value = value;
      this.sensitive = (sensitive === undefined || sensitive === null) ? undefined : !!sensitive;
    }
    if (LWM2M_TYPE.FUNCTION === this.type) {
      this.acl = ACL.EXECUTABLE;
      delete this.sensitive;
      delete this.value;
    }
    if (!this.value) {
      switch (this.type) {
        case LWM2M_TYPE.INTEGER:
        case LWM2M_TYPE.FLOAT:
          this.value = 0;
          break;
        case LWM2M_TYPE.BOOLEAN:
          this.value = false;
          break;
        case LWM2M_TYPE.STRING:
          this.value = '';
          break;
        case LWM2M_TYPE.OPAQUE:
          this.value = Buffer.from([]);
          break;
        case LWM2M_TYPE.OBJECT_LINK:
          this.value = {
            objectId: 0,
            objectInstanceId: 0
          };
          break;
        default:
      }
    }
    this.initialized = false;
  }

  /* Promise<Resource> */ init() {
    this.initialized = true;
    let init;
    if (this.value && typeof(this.value.init) === 'function') {
      init = this.value.init;
    } else if (typeof(this.value) === 'function') {
      init = this.value;
    }
    if (init) {
      try {
        return Promise.all([init.apply(this)]).then((value) => {
          return Resource.from(value[0]);
        }).then((resource) => {
          this.value = resource.value;
          return Promise.resolve(this);
        });
      } catch (_) {
        delete this.value;
      }
    }
    return Promise.resolve(this);
  }

  isExecutable() {
    return ACL.isAllowed(this.acl, ACL.EXECUTABLE);
  }

  isDeletable() {
    return ACL.isAllowed(this.acl, ACL.DELETABLE);
  }

  toValue(internal=false) {
    if (this.isExecutable()) {
      return undefined;
    }
    if (!ACL.isAllowed(this.acl, ACL.READABLE) && !internal) {
      throw { status: COAP_ERROR.COAP_405_METHOD_NOT_ALLOWED };
    }
    if (this.value && typeof(this.value.get) === 'function') {
      try {
        return this.value.get.apply(this);
      } catch (err) {
        throw { status: err.status || COAP_ERROR.COAP_500_INTERNAL_SERVER_ERROR };
      }
    }
    return this.value;
  }

  /* Promise */ update(/* any object */ newValue, owner) {
    if (this.isExecutable()) {
      return Promise.reject({
        status: COAP_ERROR.COAP_405_METHOD_NOT_ALLOWED,
        message: `Method Not Allowed (executable)`
      });
    }
    if (owner && !ACL.isAllowed(this.acl, ACL.WRITABLE)) {
      return Promise.reject({
        status: COAP_ERROR.COAP_401_UNAUTHORIZED,
        message: `Unauthorized (insufficient permission)`
      });
    }
    if (this.value && !(Buffer.isBuffer(this.value)) && typeof(this.value.set) === 'function') {
      try {
        this.value.set.apply(this, [newValue]);
        return;
      } catch (err) {
        return Promise.reject({ status: err.status || COAP_ERROR.COAP_500_INTERNAL_SERVER_ERROR });
      }
    }
    let p;
    if (newValue instanceof Resource) {
      p = Promise.resolve(newValue);
    } else {
      p = Resource.from(newValue);
    }
    return p.then((resource) => {
      if (this.type === resource.type) {
        this.value = resource.value;
      } else {
        switch (this.type) {
          case LWM2M_TYPE.STRING:
            this.value = resource.toString();
            break;
          case LWM2M_TYPE.OPAQUE:
            this.value = resource.toBuffer();
            break;
          case LWM2M_TYPE.INTEGER:
            this.value = resource.toInteger();
            break;
          case LWM2M_TYPE.FLOAT:
            this.value = resource.toFloat();
            break;
          case LWM2M_TYPE.BOOLEAN:
            this.value = resource.toBoolean();
            break;
          case LWM2M_TYPE.OBJECT_LINK:
          case LWM2M_TYPE.MULTIPLE_RESOURCE:
            return Promise.reject({
              status: COAP_ERROR.COAP_400_BAD_REQUEST,
              message: `Bad Request`
            });
          default:
            break;
        }
      }
    });
  }

  toString() {
    switch (this.type) {
      case LWM2M_TYPE.STRING:
        return this.value;
      case LWM2M_TYPE.BOOLEAN:
        return this.value ? '1' : '0';
      default:
        return this.value.toString();
    }
  }

  toBuffer() {
    return Resource.toBuffer(this.value);
  }

  toFloat() {
    switch (this.type) {
      case LWM2M_TYPE.FLOAT:
      case LWM2M_TYPE.INTEGER:
        return this.value;
      case LWM2M_TYPE.BOOLEAN:
        return this.value ? 1.0 : 0.0;
      default:
        return this.value ? parseFloat(this.value.toString()) : 0.0;
    }
  }

  toInteger() {
    switch (this.type) {
      case LWM2M_TYPE.FLOAT:
        return parseInt(this.value);
      case LWM2M_TYPE.INTEGER:
        return this.value;
      case LWM2M_TYPE.BOOLEAN:
        return this.value ? 1 : 0;
      case LWM2M_TYPE.OPAQUE:
        return this.value[0];
      default:
        return this.value ? parseInt(this.value.toString()) : 0;
    }
  }

  toBoolean() {
    switch (this.type) {
      case LWM2M_TYPE.BOOLEAN:
        return this.value;
      case LWM2M_TYPE.OPAQUE:
        return !!this.value[0];
      case LWM2M_TYPE.STRING:
        return this.value === '0' ? false : true;
      default:
        return !!this.value;
    }
  }

  static parse(/* Resource Collection */ resources, /* Buffer */ payload) {
    if (!Buffer.isBuffer(payload)) {
      return null;
    }
    let id = payload[0] + ((payload[1] << 8) & 0xff00);
    let type = payload[2];
    let len = payload[3] + ((payload[4] << 8) & 0xff00);
    let packet = payload.slice(5, 5 + len);
    let value;
    switch (type) {
      case LWM2M_TYPE.STRING:
        value = packet.toString();
        break;
      case LWM2M_TYPE.OPAQUE:
        value = packet;
        break;
      case LWM2M_TYPE.INTEGER:
        value = parseInt(packet.toString());
        break;
      case LWM2M_TYPE.FLOAT:
        value = parseFloat(packet.toString());
        break;
      case LWM2M_TYPE.BOOLEAN:
        value = packet[0] === 0x01;
        break;
      case LWM2M_TYPE.OBJECT_LINK:
        value = {
          objectId: packet[0] + ((packet[1] << 8) & 0xff00),
          objectInstanceId: packet[2] + ((packet[3] << 8) & 0xff00),
        };
        break;
      case LWM2M_TYPE.MULTIPLE_RESOURCE:
        value = {};
        while (packet.length > 0) {
          packet = Resource.parse(value, packet);
        }
        break;
      default:
        break;
    }
    resources[id] = Resource.build(id, type, null, value);
    return payload.slice(5 + len);
  }

  serialize(/* Buffer */ input=Buffer.from([])) {
    if (!ACL.isAllowed(this.acl, ACL.READABLE)) {
      return input;
    }
    let buf = [];
    buf.push(this.id & 0xff);         // ResourceId LSB
    buf.push((this.id >> 8) & 0xff);  // ResourceId MSB
    buf.push(this.type);              // Data Type
    let value = this.toValue();
    switch (this.type) {
      case LWM2M_TYPE.STRING:
        value = Buffer.from(String(value || ''));
        break;
      case LWM2M_TYPE.INTEGER:  // strtoll:int64_t
        value = Buffer.from(String(value || '0'));
        break;
      case LWM2M_TYPE.FLOAT:    // strtod:double
        value = Buffer.from(String(value || '0'));
        break;
      case LWM2M_TYPE.OPAQUE:
        value = Resource.toBuffer(value);
        break;
      case LWM2M_TYPE.BOOLEAN:
        value = Buffer.from([value ? 1 : 0]);
        break;
      case LWM2M_TYPE.OBJECT_LINK:
        if (!value ||
            typeof(value.objectId) === 'undefined' ||
            typeof(value.objectInstanceId) === 'undefined') {
          value.objectId = 0xffff;
          value.objectInstanceId = 0xffff;
        }
        value = Buffer.from([
          value.objectId & 0xff,          // Object ID LSB
          (value.objectId >> 8) & 0xff,   // Object ID MSB
          value.objectInstanceId & 0xff,        // Instance ID LSB
          (value.objectInstanceId >> 8) & 0xff, // Instance ID MSB
        ]);
        break;
      case LWM2M_TYPE.MULTIPLE_RESOURCE:
        let keys = Object.keys(value);
        let buff = Buffer.from([
          keys.length & 0xff,          // Children Length LSB
          (keys.length >> 8) & 0xff,   // Children Length MSB
        ]);
        keys.forEach((i) => {
          let r = value[i];
          if (!(r instanceof Resource)) {
            throw {
              status: COAP_ERROR.COAP_400_BAD_REQUEST,
              message: `Invalid Multiple Resource Value`
            };
          }
          r.id = i;
          buff = r.serialize(buff);
        });
        value = buff;
        break;
      case LWM2M_TYPE.FUNCTION:
        return input;
      default:
        throw {
          status: COAP_ERROR.COAP_501_NOT_IMPLEMENTED,
          message: `Unknown Type: [${this.type}] => ${JSON.stringify(this.toJSON())}`
        };
    }
    buf.push(value.length & 0xff);        // Value Length LSB
    buf.push((value.length >> 8) & 0xff); // Value Length MSB
    return Buffer.concat([input, Buffer.from(buf), value]);
  }

  // invoked by JSON.stringify()
  toJSON() {
    let value = this.toValue(true);
    if (this.type === LWM2M_TYPE.MULTIPLE_RESOURCE) {
      let obj = {};
      Object.keys(value).forEach((key) => {
        obj[key] = value[key].toJSON();
      });
      value = obj;
    }
    const json = {
      type: LWM2M_TYPE.toString(this.type),
      acl: ACL.toString(this.acl),
    };
    if (this.sensitive !== undefined) {
      json.sensitive = this.sensitive;
    }
    if (value !== undefined) {
      json.value = value;
    }
    return json;
  }

  static toBuffer(value) {
    if (value && typeof(value) === 'object' &&
        Array.isArray(value.data) &&
        value.type === 'Buffer') {
      return Buffer.from(value.data);
    } else if (Array.isArray(value)) {
      return Buffer.from(value);
    } else if (!Buffer.isBuffer(value)) {
      let input = String(value);
      let bufferType = (input.indexOf('base64:') === 0 ? 'base64' : (input.indexOf('hex:') === 0 ? 'hex' : ''));
      if (bufferType) {
        return Buffer.from(input.substring(input.indexOf(':') + 1), bufferType);
      } else {
        return Buffer.from(value);
      }
    } else if (typeof(value) === 'boolean') {
      return Buffer.from([value ? 0 : 1]);
    }
    return value;
  }

  static build(id, type=LWM2M_TYPE.UNDEFINED, acl=ACL.READABLE, value=null, sensitive=false) {
    return new Resource(id, type, acl, value, sensitive);
  }

  static /* Promise */ from(resource) {
    if ((resource instanceof Resource) && resource.initialized) {
      return Promise.resolve(resource);
    }
    switch (typeof(resource)) {
      case 'string':
        return Promise.resolve(Resource.build({
          type: 'STRING',
          value: resource || ''
        }));
      case 'number':
        return Promise.resolve(Resource.build({
          type: (String(resource).indexOf('.') >= 0) ? 'FLOAT' : 'INTEGER',
          value: resource || 0
        }));
      case 'boolean':
        return Promise.resolve(Resource.build({
          type: 'BOOLEAN',
          value: !!resource
        }));
      default:
        if (Buffer.isBuffer(resource)) {
          return Promise.resolve(Resource.build({
            type: 'OPAQUE',
            value: resource || Buffer.from([])
          }));
        } else if (Array.isArray(resource)) {
          return Promise.all(resource.map((r) => Resource.from(r))).then((values) => {
            let newValue = values.reduce((p, c, i) => {
              p[i] = c;
              return p;
            }, {});
            return Resource.build({
              type: 'MULTIPLE_RESOURCE',
              value: newValue
            });
          });
        } else if (resource && LWM2M_TYPE.toType(resource.type) === LWM2M_TYPE.MULTIPLE_RESOURCE) {
          return Resource.build(resource).init().then((resourceObject) => {
            let v = ['(error)'];
            try {
              v = resourceObject.toValue(true);
            } catch (_) {}
            let p;
            let values = {};
            if (Array.isArray(v)) {
              p = Promise.all(v.map((r) => Resource.from(r))).then((values) => {
                let newValue = values.reduce((p, c, i) => {
                  p[i] = c;
                  return p;
                }, {});
                return Promise.resolve(newValue);
              });
            } else {
              p = Promise.all(Object.keys((v || {})).map((i) => {
                return Resource.from(v[i]).then((r) => values[i] = r);
              })).then(() => {
                return Promise.resolve(values);
              });
            }
            return p.then((values) => {
              return Resource.build({
                type: 'MULTIPLE_RESOURCE',
                acl: resourceObject.acl,
                sensitive: resourceObject.sensitive,
                value: values
              });
            });
          });
        } else {
          return Resource.build(resource).init();
        }
    }
  }
}

export class ResourceRepositoryBuilder {
  constructor(json={}, addDefaultRepo=true) {
    if (!Array.isArray(json)) {
      json = [json];
    }
    if (addDefaultRepo) {
      json.push(DEFAULT_REPO);
    }
    // merge all objects
    this.json = {};
    json.forEach((objects) => {
      Object.keys(objects).forEach((objectId) => {
        if (!/^\d+$/.test(objectId)) {
          return;
        }
        let object = objects[objectId];
        if (!this.json[objectId]) {
          this.json[objectId] = {};
        }
        Object.keys(object).forEach((objectInstanceId) => {
          let instance = object[objectInstanceId];
          if (!this.json[objectId][objectInstanceId]) {
            this.json[objectId][objectInstanceId] = {};
          }
          Object.keys(instance).forEach((resourceId) => {
            let resource = instance[resourceId];
            if (!this.json[objectId][objectInstanceId][resourceId]) {
              this.json[objectId][objectInstanceId][resourceId] = resource;
            }
          });
        });
      });
    });
  }

  build(opts={}) {
    let repo = {
      extraObjectIdArray: []
    };
    let p = [];
    let overlaidObjects = [-1, -1, []]; // for Security/Server/ACL objects
    const intSorter = (a, b) => a - b;
    const intMapper = k => parseInt(k);
    Object.keys(this.json).map(intMapper).sort(intSorter).forEach((objectId) => {
      let instances = this.json[objectId];
      if (typeof(instances) !== 'object') {
        return;
      }
      objectId = LWM2M_OBJECT_ID.toType(objectId, objectId);
      if (objectId > LWM2M_OBJECT_ID.DEVICE) {
        repo.extraObjectIdArray.push(objectId);
      }
      Object.keys(instances).map(intMapper).sort(intSorter).forEach((objectInstanceId) => {
        let resources = instances[objectInstanceId];
        if (typeof(resources) !== 'object') {
          return;
        }
        let uriBase = `/${objectId}/${objectInstanceId}`;
        Object.keys(resources).map(intMapper).sort(intSorter).forEach((resourceId) => {
          p.push(Resource.from(resources[resourceId]).then((resource) => {
            if (opts.hideSensitiveInfo && resource.sensitive) {
              return;
            }
            // Replace ServerID to Security, Server and ACL objects where its value is 0
            switch (objectId) {
              case LWM2M_OBJECT_ID.SECURITY: {
                if (overlaidObjects[LWM2M_OBJECT_ID.SECURITY] < 0 &&
                    (/* Server ID */ resourceId === 10) && (resource.value < 1)) {
                  overlaidObjects[LWM2M_OBJECT_ID.SECURITY] = objectInstanceId;
                }
                break;
              }
              case LWM2M_OBJECT_ID.SERVER: {
                if (overlaidObjects[LWM2M_OBJECT_ID.SERVER] < 0 &&
                    (/* Server ID */ resourceId === 0) && (resource.value < 1)) {
                  overlaidObjects[LWM2M_OBJECT_ID.SERVER] = objectInstanceId;
                }
                break;
              }
              case LWM2M_OBJECT_ID.ACL: {
                if ((/* Server ID */ resourceId === 3) && (resource.value < 1)) {
                  overlaidObjects[LWM2M_OBJECT_ID.ACL].push(objectInstanceId);
                }
                break;
              }
              default:
            }
            let uri = `${uriBase}/${resourceId}`;
            resource.id = resourceId;
            repo[uri] = resource;
          }));
        });
      });
    });
    return Promise.all(p).then(() => {
      if (this.json[LWM2M_OBJECT_ID.SECURITY] && overlaidObjects[LWM2M_OBJECT_ID.SECURITY] >= 0) {
        this._applyOptionsToSecurityObject(overlaidObjects, opts, repo);
      }
      if (this.json[LWM2M_OBJECT_ID.SERVER] && overlaidObjects[LWM2M_OBJECT_ID.SERVER] >= 0) {
        this._applyOptionsToServerObject(overlaidObjects, opts, repo);
      }
      if (this.json[LWM2M_OBJECT_ID.ACL] && overlaidObjects[LWM2M_OBJECT_ID.ACL].length > 0) {
        this._applyOptionsToACLObject(overlaidObjects, opts, repo);
      }
      repo.toJSONString = () => {
        let obj = {
          version: '1.0.0' // format version
        };
        Object.keys(repo).forEach((uri) => {
          let ids = uri.split('/').splice(1);
          let objectId = ids[0];
          if (isNaN(parseInt(objectId))) {
            return;
          }
          let objectInstanceId = ids[1];
          if (isNaN(parseInt(objectInstanceId))) {
            return;
          }
          let resourceId = ids[2];
          if (isNaN(parseInt(resourceId))) {
            return;
          }
          if (!obj[objectId]) {
            obj[objectId] = {};
          }
          if (!obj[objectId][objectInstanceId]) {
            obj[objectId][objectInstanceId] = {};
          }
          obj[objectId][objectInstanceId][resourceId] = repo[uri];
        });
        return JSON.stringify(obj);
      };
      return Promise.resolve(repo);
    });
  }

  _applyOptionsToSecurityObject(overlaidObjects, opts, repo) {
    // Security URI Prefix
    const securityUriPrefix = `/${LWM2M_OBJECT_ID.SECURITY}/${overlaidObjects[LWM2M_OBJECT_ID.SECURITY]}`;

    // Update Server URI
    let uriPrefix = 'coap://';
    if (opts.enableDTLS) {
      uriPrefix = 'coaps://';
      repo[`${securityUriPrefix}/2`].value = 0; // PSK
      repo[`${securityUriPrefix}/3`] = Resource.build({type: 'OPAQUE', value: opts.pskIdentity});
      repo[`${securityUriPrefix}/5`] = Resource.build({type: 'OPAQUE', value: `hex:${opts.presharedKey}`});
    } else {
      repo[`${securityUriPrefix}/2`].value = 3; // NONE
    }
    repo[`${securityUriPrefix}/0`].value = `${uriPrefix}${opts.serverHost}:${opts.serverPort}`;
    // Bootstrap?
    repo[`${securityUriPrefix}/1`].value = !!opts.requestBootstrap;
    // Short Server ID
    repo[`${securityUriPrefix}/10`].value = opts.serverId;
    // Client Hold Off Time
    repo[`${securityUriPrefix}/11`].value = opts.clientHoldOffTime || 10;
  }

  _applyOptionsToServerObject(overlaidObjects, opts, repo) {
    // Server URI Prefix
    const serverUriPrefix = `/${LWM2M_OBJECT_ID.SERVER}/${overlaidObjects[LWM2M_OBJECT_ID.SERVER]}`;
    // Short Server ID
    repo[`${serverUriPrefix}/0`].value = opts.serverId;
    // Lifetime
    repo[`${serverUriPrefix}/1`].value = opts.lifetimeSec;
  }

  _applyOptionsToACLObject(overlaidObjects, opts, repo) {
    // ACL URI Prefix
    overlaidObjects[LWM2M_OBJECT_ID.ACL].forEach((objectId) => {
      const aclUriPrefix = `/${LWM2M_OBJECT_ID.ACL}/${objectId}`;
      // ACL
      const oldServerId = repo[`${aclUriPrefix}/3`].toInteger();
      const oldServerACLResource = repo[`${aclUriPrefix}/2`].value[oldServerId];
      if (oldServerACLResource) {
        delete repo[`${aclUriPrefix}/2`].value[oldServerId];
        repo[`${aclUriPrefix}/2`].value[opts.serverId] = oldServerACLResource;
      } else {
        // Multiple Resource value should be a Resource object
        repo[`${aclUriPrefix}/2`].value[opts.serverId] = Resource.from(ACL.ALL);
      }
      // Access Control Owner (Server ID)
      repo[`${aclUriPrefix}/3`].value = opts.serverId;
    });
  }
}

export class RequestHandler {

  constructor(
      /* LwM2MClientProxy */ client,
      /* string */ command,
      /* Buffer */ payload=Buffer.from([])) {
    this.client = client;
    this.command = command;
    this.payload = payload;
    if (payload[0] === 0x01) {
      this.isRequest = true;
    } else if (payload[0] === 0x02) {
      this.isRequest = false;
    }
    this.messageId = payload[1];
    this.objectId = payload[2] + ((payload[3] << 8) & 0xff00);
    this.objectInstanceId = payload[4] + ((payload[5] << 8) & 0xff00);
    this.resourceLen = payload[6] + ((payload[7] << 8) & 0xff00);
    this.resources = {};

    this.response = Buffer.concat([
      Buffer.from([
        0x02, // response data type
        this.messageId,
        COAP_ERROR.COAP_NO_ERROR // result status code
      ]),
      payload.slice(2, 8) // truncate incoming resource blocks
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
      let r = this.resources[key].value;
      if (r instanceof Resource) {
        try {
          let out = r.serialize(res);
          if (out !== res) {
            res = out;
            ++len;
          }
        } catch (e) {
          let err = {
            status: e.status || COAP_ERROR.COAP_500_INTERNAL_SERVER_ERROR,
            message: e.message
          };
          this.setStatus(err.status);
          if (e.stack) {
            this.client.log(e.stack);
          }
          this.client.error(`lwm2m error`, { payload: err });
        }
      }
    });
    if (this.getStatus() < COAP_ERROR.COAP_400_BAD_REQUEST) {
      this.response = Buffer.concat([this.response, res]);
      this.setResourceLen(len);
    }
  }

  perform() {
    let resp = `/resp:${this.command}:${this.response.toString('base64')}`;
    return Promise.resolve({
      status: this.getStatus(),
      payload: resp
    });
  }
}

class IgnoreRequest extends RequestHandler {

  constructor(client, command) {
    super(client, command);
    this.setStatus(COAP_ERROR.COAP_IGNORE);
    this.client.log(`[Ignore] Ignore Unknown Request:${command}`);
  }

}

class Read extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
    if (this.resourceLen > 0) {
      let res = [];
      for (let i = 0; i < this.resourceLen; i++) {
        let idx = 8 + i * 2;
        let id = payload[idx] + ((payload[idx + 1] << 8) & 0xff00);
        res.push(Resource.build(id));
      }
      this.uris = res.map((resource) => {
        let uri = `^/${this.objectId}/${this.objectInstanceId}/${resource.id}$`;
        this.resources[uri] = resource;
        return uri;
      });
    } else {
      // query all
      this.uris = [`^/${this.objectId}/${this.objectInstanceId}/[0-9]+$`];
    }
    super.setStatus(COAP_ERROR.COAP_205_CONTENT);
  }

  perform() {
    return this.client.objectStore.remoteGet(this.uris).then((resources) => {
      let resourceLen = resources.length;
      if (resourceLen === 0) {
        super.setStatus(COAP_ERROR.COAP_404_NOT_FOUND);
        return super.perform();
      } else if (resourceLen === 1) {
        if (!ACL.isAllowed(ACL.toValue(resources[0].value.acl), ACL.READABLE)) {
          this.setStatus(COAP_ERROR.COAP_405_METHOD_NOT_ALLOWED);
          return super.perform();
        }
      }
      this.client.debug(`<Read> uris=>${this.uris}, response=>${JSON.stringify(resources)}`);
      // build response
      this.resources = resources || [];
      this.buildResponse();
      return super.perform();
    }).catch((e) => {
      let err = {
        status: e.status || COAP_ERROR.COAP_400_BAD_REQUEST,
        message: e.message
      };
      this.client.error(`[Read] Error Message:${err.message || ''}`, { payload: err });
      super.setResourceLen(0);
      super.setStatus(err.status);
      return super.perform();
    });
  }

}

class Write extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
    this.params = {};
    let resources = {};
    Resource.parse(resources, payload.slice(8));
    Object.keys(resources).forEach((id) => {
      const resource = resources[id];
      let uri = `/${this.objectId}/${this.objectInstanceId}/${resource.id}`;
      this.params[uri] = resource;
    });
    super.setStatus(COAP_ERROR.COAP_204_CHANGED);
  }

  perform() {
    super.setResourceLen(0);
    this.client.debug(`<Write> this.params=>${JSON.stringify(this.params)}`);
    return this.client.objectStore.remoteWrite(this.params).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.error(`[Write] Error Message:${err.message || ''}`, { payload: err });
      super.setStatus(err.status || COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

class Execute extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
    this.resourceId = payload[8] + ((payload[9] << 8) & 0xff00);
    this.param = payload.slice(10);
    if (this.param.length === 0) {
      this.param = null;
    }
    super.setStatus(COAP_ERROR.COAP_204_CHANGED);
  }

  perform() {
    super.setResourceLen(0);
    let uri = `/${this.objectId}/${this.objectInstanceId}/${this.resourceId}`;
    return this.client.objectStore.remoteExecute(uri, this.param).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.error(`[Execute] Error Message:${err.message || ''}`, { payload: err });
      super.setStatus(err.status || COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

class StateChanged extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command);
    this.stateLabel = payload.toString();
    this.client.debug(`[StateChanged] state=>${this.stateLabel}`);
  }

  perform() {
    let ev = StateChanged.STATE_TABLE[this.stateLabel];
    if (ev) {
      this.client.emit(ev);
    }
    return Promise.resolve({
      status: COAP_ERROR.COAP_IGNORE
    });
  }

}

StateChanged.STATE_TABLE = {
  STATE_BOOTSTRAP_REQUIRED: 'bootstrapRequired',
  STATE_BOOTSTRAPPING: 'bootstrapping',
  STATE_REGISTER_REQUIRED: 'registerRequired',
  STATE_REGISTERING: 'registering',
  STATE_READY: 'connected',
};

class Observe extends RequestHandler {

  constructor(client, command) {
    super(client, command);
  }

  buildResponse(uris) {
    let res = Buffer.from([
      uris.length & 0xff,       // URI size LSB
      (uris.length >> 8) & 0xff // URI size MSB
    ]);
    uris.forEach((uri) => {
      res = Buffer.concat([res, Buffer.from([
        uri.length & 0xff,       // URI length LSB
        (uri.length >> 8) & 0xff // URI length MSB
      ]), Buffer.from(uri)]);
    });
    this.response = Buffer.concat([this.response, res]);
  }

  perform() {
    let uris = this.client.getUpdatedUrisAndReset();
    this.client.debug(`[Observe] # of updated uris:${uris.length}`);
    if (uris.length > 0) {
      this.buildResponse(uris);
      return super.perform();
    }
    return Promise.resolve({
      status: COAP_ERROR.COAP_IGNORE
    });
  }

}

class Discover extends Read {
  buildResponse() {
    let buf = [];
    this.resources.map((r) => {
      return parseInt(r.uri.split('/')[3]);
    }).sort((a, b) => a - b).forEach((id) => {
      buf.push(id & 0xff);         // ResourceId LSB
      buf.push((id >> 8) & 0xff);  // ResourceId MSB
    });
    if (this.getStatus() < COAP_ERROR.COAP_400_BAD_REQUEST) {
      this.response = Buffer.concat([this.response, Buffer.from(buf)]);
      this.setResourceLen(this.resources.length);
    }
  }
}

class Create extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
    this.params = {};
    let resources = {};
    Resource.parse(resources, payload.slice(8));
    Object.keys(resources).forEach((id) => {
      const resource = resources[id];
      let uri = `/${this.objectId}/${this.objectInstanceId}/${resource.id}`;
      this.params[uri] = resource;
    });
    super.setStatus(COAP_ERROR.COAP_201_CREATED);
  }

  perform() {
    super.setResourceLen(0);
    this.client.debug(`<Create> this.params=>${JSON.stringify(this.params)}`);
    return this.client.objectStore.remoteCreate(this.params).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.error(`[Create] Error Message:${err.message || ''}`, { payload: err });
      super.setStatus(err.status || COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

class Delete extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
    this.param = `^/${this.objectId}/${this.objectInstanceId}/[0-9]+$`;
    super.setStatus(COAP_ERROR.COAP_202_DELETED);
  }

  perform() {
    super.setResourceLen(0);
    this.client.debug(`<Delete> this.params=>${this.param}`);
    return this.client.objectStore.remoteDelete(this.param).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.error(`[Delete] Error Message:${err.message || ''}`, { payload: err });
      super.setStatus(err.status || COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

RequestHandler.build = (client, command, payload) => {
  switch (command) {
    case 'read':
      return new Read(client, command, payload);
    case 'write':
      return new Write(client, command, payload);
    case 'execute':
      return new Execute(client, command, payload);
    case 'create':
      return new Create(client, command, payload);
    case 'delete':
      return new Delete(client, command, payload);
    case 'discover':
      return new Discover(client, command, payload);
    case 'observe':
      return new Observe(client, command);
    // not a lwm2m command
    case 'stateChanged':
      return new StateChanged(client, command, payload);
    default:
      return new IgnoreRequest(client, command);
  }
};

export class LwM2MClientProxy extends EventEmitter {

  constructor(opts={}, objectStore={}) {
    super();
    this.clientName = opts.clientName;
    this.clientPort = opts.clientPort;
    this.useIPv4 = opts.useIPv4;
    this.log = opts.log ? opts.log.bind(opts) : console.log;
    this.trace = opts.trace ? opts.trace.bind(opts) : console.log;
    this.debug = opts.debug ? opts.debug.bind(opts) : console.log;
    this.error = opts.error ? opts.error.bind(opts) : console.error;
    this.objectStore = objectStore;
    this.reconnectSec = opts.reconnectSec || 60;
    this.redirectLwm2mClientLog = opts.redirectLwm2mClientLog;
    this.autoReconnect = (this.reconnectSec > 0);
    this.autoReconnectTask = null;
  }

  getUpdatedUrisAndReset() {
    let uris = this.objectStore.updatedUris || [];
    this.objectStore.updatedUris = [];
    return uris;
  }

  isConnected() {
    return !!this.cproc;
  }

  shutdown() {
    this.autoReconnect = false;
    if (this.autoReconnectTask) {
      clearTimeout(this.autoReconnectTask);
      this.autoReconnectTask = null;
    }
    let isConnected = this.isConnected();
    return new Promise((resolve) => {
      if (isConnected) {
        this.cproc.kill('SIGINT');
        this.once('disconnected', () => {
          return resolve(true);
        });
      } else {
        return resolve();
      }
    });
  }

  start() {
    let args = ['-n', this.clientName];
    if (this.useIPv4) {
      args.push('-4');
    }
    args.push('-l');
    args.push(this.clientPort);
    args.push('-o');
    args.push(this.objectStore.getExtraObjectIDArray().join(','));

    // This function call may throw an exception on error
    this.cproc = cproc.spawn(`${CLIENT_PATH}/wakatiwaiclient`, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', this.redirectLwm2mClientLog ? process.stderr : 'ignore']
    });
    this.emit('registering');
    if (this.autoReconnectTask) {
      clearTimeout(this.autoReconnectTask);
      this.autoReconnectTask = null;
    }
    this.cproc.on('exit', (code) => {
      this.log(`Process Exit: pid => ${this.cproc.pid}, code => ${code}, autoReconnect => ${this.autoReconnect} (after ${this.reconnectSec} sec.)`);
      this.cproc = null;
      this.emit('disconnected');
      if (this.autoReconnect) {
        this.autoReconnectTask = setTimeout(() => {
          this.start();
        }, this.reconnectSec * 1000);
      }
    });
    this.cproc.stdout.on('data', (data) => {
      let lines = data.toString().split(/[\r\n]+/).filter((line) => line.trim());
      this.trace(`<stdout> [Request] ${lines.length} lines, => ${lines}`);
      let procs = lines.map((line) => {
        let body = line.split(':');
        let command = body[0];
        if (!command || typeof(body[1]) === 'undefined') {
          return Promise.resolve();
        }
        command = command.substring(1);
        let request = RequestHandler.build(this, command, Buffer.from(body[1], 'base64'));
        this.trace(`request => ${request.toJSONString()}`);
        return request.perform().then((resp) => {
          if (resp.status !== COAP_ERROR.COAP_IGNORE) {
            this.cproc.stdin.write(resp.payload);
          }
          this.trace(`<stdout> [Response:done] status:${COAP_ERROR.toString(resp.status)}`);
        }).catch((err) => {
          this.cproc.stdin.write(err.payload || err.toString());
          this.trace(`<stdout> [Response:error] ${err.payload ? JSON.stringify(err) : err.stack}`);
        });
      });
      promiseSerial(procs).then(() => {
        this.trace(`<stdout> [Request] Done`);
      }).catch((err) => {
        this.log(err);
      });
    });
  }
}

export class LwM2MObjectStore {
  constructor(opts) {
    this.repo = null;
    this.serverId = opts.serverId;
    this.propagator = opts;
    this.updatedUris = [];
  }
  getExtraObjectIDArray() {
    return this.repo ? this.repo.extraObjectIdArray.slice() : [];
  }
  emit(uri, value, eventType, remote) {
    this.propagator.emit('object-event', {
      serverId: remote ? this.serverId : undefined,
      uri: uri,
      value: value,
      eventType: eventType,
      remote: remote,
      ts: Date.now()
    });
  }
  write(uri, /* any object */ value, /* boolean */ remote) {
    if (!this.repo) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.write(uri, value, remote).then(() => {
            return resolve();
          }).catch((err) => {
            return reject(err);
          });
        }, 500);
      });
    }
    if (uri && this.repo[uri]) {
      let resource = this.repo[uri];
      return resource.update(value, remote ? this.serverId : undefined).then(() => {
        if (this.updatedUris.indexOf(uri) < 0) {
          this.updatedUris.push(uri);
        }
        this.emit(uri, resource, 'updated', remote);
        return Promise.resolve();
      }).catch((err) => {
        if (!remote) {
          err.uri = uri;
          err.value = value;
          err.operation = 'write';
        }
        return Promise.reject(err);
      });
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND,
      message: `Not Found`,
      operation: 'write',
      uri: uri,
      value: value
    });
  }
  execute(uri, /* Buffer */ value, /* boolean */ remote) {
    if (!this.repo) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.execute(uri, value, remote).then(() => {
            return resolve();
          }).catch((err) => {
            return reject(err);
          });
        }, 500);
      });
    }
    if (uri && this.repo[uri]) {
      let resource = this.repo[uri];
      if (resource.isExecutable()) {
        this.emit(uri, value, 'executed', remote);
        return Promise.resolve();
      } else {
        return Promise.reject({
          status: COAP_ERROR.COAP_405_METHOD_NOT_ALLOWED,
          message: `Method Not Allowed`,
          operation: 'execute',
          uri: uri,
          value: value
        });
      }
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND,
      message: `Not Found`,
      operation: 'execute',
      uri: uri,
      value: value
    });
  }
  _normalizeUriRegEx(uriRegEx) {
    if (uriRegEx.charAt(0) !== '^') {
      uriRegEx = '^' + uriRegEx;
    }
    if (uriRegEx.indexOf('$') < 0) {
      uriRegEx = uriRegEx + '$';
    }
    return uriRegEx;
  }
  get(uriRegEx, result=[], resourceType=false) {
    if (!this.repo) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.get(uriRegEx, result, resourceType).then((out) => {
            return resolve(out);
          }).catch((err) => {
            return reject(err);
          });
        }, 500);
      });
    }
    if (uriRegEx) {
      uriRegEx = this._normalizeUriRegEx(uriRegEx);
      Object.keys(this.repo).sort().map((uri) => {
        if (uri.match(uriRegEx)) {
          result.push({
            uri: uri,
            value: resourceType ? this.repo[uri] : this.repo[uri].toJSON()
          });
        }
      });
      if (result.length > 0) {
        return Promise.resolve(result);
      }
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND,
      message: `Not Found`,
      operation: 'read',
      uriRegEx: uriRegEx,
    });
  }
  create(uri, value, remote) {
    if (!this.repo) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.create(uri, value, remote).then(() => {
            return resolve();
          }).catch((err) => {
            return reject(err);
          });
        }, 500);
      });
    }
    if (uri) {
      return Resource.from(value).then((resource) => {
        this.repo[uri] = resource;
        if (this.updatedUris.indexOf(uri) < 0) {
          this.updatedUris.push(uri);
        }
        this.emit(uri, this.repo[uri], 'created', remote);
        return Promise.resolve();
      });
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND,
      message: `Not Found`,
      operation: 'create',
      uri: uri,
      value: value
    });
  }
  delete(uriRegEx, remote) {
    if (!this.repo) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.delete(uriRegEx, remote).then(() => {
            return resolve();
          }).catch((err) => {
            return reject(err);
          });
        }, 500);
      });
    }
    if (uriRegEx) {
      uriRegEx = this._normalizeUriRegEx(uriRegEx);
      let keysToRemove = Object.keys(this.repo).map((uri) => {
        if (uri.match(uriRegEx)) {
          return uri;
        }
      }).filter(uri => uri);
      if (keysToRemove.length > 0) {
        let failedToDelete = 0;
        keysToRemove.forEach((uri) => {
          if (!remote || this.repo[uri].isDeletable()) {
            if (this.updatedUris.indexOf(uri) < 0) {
              this.updatedUris.push(uri);
            }
            delete this.repo[uri];
            this.emit(uri, null, 'deleted', remote);
          } else {
            failedToDelete++;
          }
        });
        if (failedToDelete > 0 && keysToRemove.length === failedToDelete) {
          return Promise.reject({
            status: COAP_ERROR.COAP_401_UNAUTHORIZED,
            message: `Unauthorized (insufficient permission)`,
            operation: 'delete',
            uri: keysToRemove[0]
          });
        }
        return Promise.resolve();
      }
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND,
      message: `Not Found`,
      operation: 'delete',
      uriRegEx: uriRegEx
    });
  }
  remoteWrite(/* uri-value pair object */ params) {
    if (params && Object.keys(params).length > 0) {
      return Promise.all(Object.keys(params).map((uri) => {
        let value = params[uri];
        return this.write(uri, value, true);
      }));
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_400_BAD_REQUEST
    });
  }
  remoteExecute(uri, /* Buffer */ param) {
    if (uri) {
      return this.execute(uri, param, true);
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND
    });
  }
  remoteGet(/* Array */ uris) {
    if (uris && uris.length > 0) {
      let result = [];
      return Promise.all(uris.map((uri) => {
        return this.get(uri, result, true);
      })).then(() => {
        return Promise.resolve(result);
      });
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_400_BAD_REQUEST
    });
  }
  remoteCreate(/* uri-value pair object */ params) {
    if (params && Object.keys(params).length > 0) {
      return Promise.all(Object.keys(params).map((uri) => {
        let value = params[uri];
        return this.create(uri, value, true);
      }));
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND
    });
  }
  remoteDelete(uri) {
    if (uri) {
      return this.delete(uri, true);
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND
    });
  }
}
