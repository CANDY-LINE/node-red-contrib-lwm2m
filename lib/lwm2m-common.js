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
import deviceObject from './object-device';

// pointing to .node file
const BINDING_PATH = binary.find(path.resolve(path.join(__dirname, '..', 'package.json')));
const CLIENT_PATH = path.resolve(BINDING_PATH, '..');

const DEFAULT_REPO = {
  DEVICE: deviceObject,
};

// https://hackernoon.com/functional-javascript-resolving-promises-sequentially-7aac18c4431e
const promiseSerial = promises =>
  promises.reduce((promise, p) =>
    promise.then(result => p.then(Array.prototype.concat.bind(result))),
    Promise.resolve([]));

class Resource {

  constructor(id, type=LWM2M_TYPE.UNDEFINED, acl=ACL.PERMANENT, value=null) {
    if (typeof(id) === 'object') {
      this.id = id.id;
      this.type = LWM2M_TYPE.toType(id.type);
      this.acl = id.acl || ACL.PERMANENT;
      this.value = id.value;
    } else {
      this.id = id;
      this.type = LWM2M_TYPE.toType(type);
      this.acl = acl || ACL.PERMANENT;
      this.value = value;
    }
  }

  isExecutable() {
    return ACL.isAllowed(this.acl, ACL.EXECUTABLE);
  }

  toValue() {
    if (this.isExecutable()) {
      return undefined;
    }
    if (typeof(this.value) === 'function') {
      return Resource.from(this.value.apply(this)).value;
    }
    return this.value;
  }

  static parse(/* Resource Array */ resources, /* Buffer */ payload) {
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
        value = [];
        while (packet.length > 0) {
          packet = Resource.parse(value, packet);
        }
        break;
      default:
        break;
    }
    resources.push(Resource.build(id, type, null, value));
    return payload.slice(5 + len);
  }

  serialize(/* Buffer */ input) {
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
      case LWM2M_TYPE.INTEGER:  // strtoll:int64_t
      case LWM2M_TYPE.FLOAT:    // strtod:double
        value = Buffer.from(String(value || ''));
        break;
      case LWM2M_TYPE.OPAQUE:
        if (!Buffer.isBuffer(value)) {
          let input = String(value);
          let bufferType = input.split(':')[0] || '';
          bufferType = (bufferType.toLowerCase() === 'base64') ? 'base64' : 'hex';
          value = Buffer.from(input, bufferType);
        }
        break;
      case LWM2M_TYPE.BOOLEAN:
        value = Buffer.from([value ? 1 : 0]);
        break;
      case LWM2M_TYPE.OBJECT_LINK:
        if (typeof(value.objectId) === 'undefined' ||
            typeof(value.instanceId) === 'undefined') {
          throw new Error(`Invalid Data Type. Either objectId or instanceId is missing`);
        }
        value = Buffer.from([
          value.objectId & 0xff,          // Object ID LSB
          (value.objectId >> 8) & 0xff,   // Object ID MSB
          value.instanceId & 0xff,        // Instance ID LSB
          (value.instanceId >> 8) & 0xff, // Instance ID MSB
        ]);
        break;
      case LWM2M_TYPE.MULTIPLE_RESOURCE:
        let buff = Buffer.from([
          value.length & 0xff,          // Children Length LSB
          (value.length >> 8) & 0xff,   // Children Length MSB
        ]);
        value.forEach((r, i) => {
          if (!(r instanceof Resource)) {
            r = Resource.from(r);
          }
          r.id = i;
          buff = r.serialize(buff);
        });
        value = buff;
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
      value: this.toValue()
    };
  }

  static build(id, type=LWM2M_TYPE.UNDEFINED, acl=ACL.PERMANENT, value=null) {
    return new Resource(id, type, acl, value);
  }

  static from(resource) {
    if (resource instanceof Resource) {
      return resource;
    }
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
        if (Buffer.isBuffer(resource)) {
          resource = Resource.build({
            type: 'OPAQUE',
            value: resource
          });
        } else if (Array.isArray(resource)) {
          resource = Resource.build({
            type: 'MULTIPLE_RESOURCE',
            value: resource.map((r) => Resource.from(r))
          });
        } else {
          resource = Resource.build(resource);
        }
    }
    return resource;
  }
}

export class ResourceRepositoryBuilder {
  constructor(json=DEFAULT_REPO) {
    this.json = json;
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
          let resource = Resource.from(resources[resourceId]);
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
    this.instanceId = payload[4] + ((payload[5] << 8) & 0xff00);
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

class IgnoreRequest extends RequestHandler {

  constructor(client, command) {
    super(client, command);
    this.setStatus(COAP_ERROR.COAP_IGNORE);
    this.client.log(`[Ignore] Ignore Unknown Request:${command}`);
  }

}

class NotImplemented extends RequestHandler {

  constructor(client, command) {
    super(client, command);
    this.setStatus(COAP_ERROR.COAP_501_NOT_IMPLEMENTED);
  }

}

class Read extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
    let res = [];
    for (let i = 0; i < this.resourceLen; i++) {
      let idx = 8 + i * 2;
      let id = payload[idx] + ((payload[idx + 1] << 8) & 0xff00);
      res.push(Resource.build(id));
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
      let resourceLen = keys.length;
      if (resourceLen === 0) {
        super.setStatus(COAP_ERROR.COAP_404_NOT_FOUND);
        return super.perform();
      } else if (resourceLen === 1) {
        if (!ACL.isAllowed(resources[keys[0]].acl, ACL.READABLE)) {
          this.setStatus(COAP_ERROR.COAP_405_METHOD_NOT_ALLOWED);
          return super.perform();
        }
      }
      // build response
      this.resources = resources || {};
      super.buildResponse();
      return super.perform();
    }).catch(() => {
      super.setResourceLen(0);
      super.setStatus(COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

class Write extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
    this.params = {};
    let resources = [];
    Resource.parse(resources, payload.slice(8));
    resources.forEach((resource) => {
      let uri = `/${this.objectId}/${this.instanceId}/${resource.id}`;
      this.params[uri] = resource;
    });
    super.setStatus(COAP_ERROR.COAP_204_CHANGED);
  }

  perform() {
    super.setResourceLen(0);
    return this.client.objectStore.remoteWrite(this.params).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.log(`[Write] Error Message:${err.message || ''}`);
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
    let uri = `/${this.objectId}/${this.instanceId}/${this.resourceId}`;
    return this.client.objectStore.remoteExecute(uri, this.param).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.log(`[Execute] Error Message:${err.message || ''}`);
      super.setStatus(err.status || COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

class StateChanged extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command);
    this.stateLabel = payload.toString();
    this.client.log(`state=>${this.stateLabel}`);
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
    this.client.log(`[Observe] uris.length:${uris.length}`);
    if (uris.length > 0) {
      this.buildResponse(uris);
      return super.perform();
    }
    return Promise.resolve({
      status: COAP_ERROR.COAP_IGNORE
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
      return new NotImplemented(client, command);
    case 'delete':
      return new NotImplemented(client, command);
    case 'discover':
      return new NotImplemented(client, command);
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
    this.enableDTLS = opts.enableDTLS;
    this.clientPort = opts.clientPort;
    this.lifetimeSec = opts.lifetimeSec;
    this.requestBootstrap = opts.requestBootstrap;
    this.useIPv4 = opts.useIPv4;
    this.pskIdentity = opts.pskIdentity;
    this.presharedKey = opts.presharedKey;
    this.serverHost = opts.serverHost;
    this.serverPort = opts.serverPort;
    this.log = opts.log || console.log;
    this.objectStore = objectStore;
    this.autoReconnect = true;
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
    if (this.isConnected()) {
      this.cproc.kill('SIGINT');
    }
  }

  start() {
    let args = ['-n', this.clientName];
    if (this.useIPv4) {
      args.push('-4');
    }
    if (this.enableDTLS) {
      args.push('-i');
      args.push(this.pskIdentity);
      args.push('-s');
      args.push(this.presharedKey);
    }
    args.push('-h');
    args.push(this.serverHost);
    args.push('-p');
    args.push(this.serverPort);

    // This function call may throw an exception on error
    this.cproc = cproc.spawn(`${CLIENT_PATH}/lwm2mclient`, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', process.stderr]
    });
    this.emit('registering');
    this.cproc.on('exit', (code) => {
      this.log(`Process Exit: pid => ${this.cproc.pid}, code => ${code}, autoReconnect => ${this.autoReconnect}`);
      this.cproc = null;
      this.emit('disconnected');
      if (this.autoReconnect) {
        setTimeout(() => {
          this.start();
        }, 1000);
      }
    });
    this.cproc.stdout.on('data', (data) => {
      let lines = data.toString().split(/[\r\n]+/).filter((line) => line.trim());
      this.log(`<stdout> [Request] ${lines.length} lines, => ${lines}`);
      let procs = lines.map((line) => {
        let body = line.split(':');
        let command = body[0];
        if (!command || typeof(body[1]) === 'undefined') {
          return Promise.resolve();
        }
        command = command.substring(1);
        let request = RequestHandler.build(this, command, Buffer.from(body[1], 'base64'));
        this.log(`request => ${request.toJSONString()}`);
        return request.perform().then((resp) => {
          if (resp.status !== COAP_ERROR.COAP_IGNORE) {
            this.cproc.stdin.write(resp.payload);
          }
          this.log(`<stdout> [Response:done] status:${COAP_ERROR.toString(resp.status)}`);
        }).catch((err) => {
          this.cproc.stdin.write(err.payload || err.toString());
          this.log(`<stdout> [Response:error] ${err.payload ? JSON.stringify(err) : err.stack}`);
        });
      });
      promiseSerial(procs).then(() => {
        this.log(`<stdout> [Request] Done`);
      }).catch((err) => {
        this.log(err);
      });
    });
  }
}

export class LwM2MObjectStore {
  constructor(opts) {
    this.repoFileName = `lwm2m_${opts.clientName}_${opts.serverHost}_${opts.serverPort}.json`;
    this.repo = null;
    this.propagator = opts;
    this.updatedUris = [];
  }
  emit(uri, value, eventType, remote) {
    this.propagator.emit('object-event', {
      uri: uri,
      value: value,
      eventType: eventType,
      remote: remote,
      ts: Date.now()
    });
  }
  write(uri, /* Resource */ value, /* boolean */ remote) {
    if (uri && this.repo[uri]) {
      value = Resource.from(value);
      this.repo[uri] = value;
      if (this.updatedUris.indexOf(uri) < 0) {
        this.updatedUris.push(uri);
      }
      this.emit(uri, value, 'updated', remote);
      return Promise.resolve();
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND
    });
  }
  execute(uri, /* Buffer */ param, /* boolean */ remote) {
    if (uri && this.repo[uri]) {
      let resource = this.repo[uri];
      if (resource.isExecutable()) {
        this.emit(uri, param, 'executed', remote);
        return Promise.resolve();
      } else {
        return Promise.reject({
          status: COAP_ERROR.COAP_405_METHOD_NOT_ALLOWED
        });
      }
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND
    });
  }
  get(uriRegEx) {
    if (uriRegEx) {
      let result = {};
      Object.keys(this.repo).map((uri) => {
        if (uri.match(uriRegEx)) {
          result[uri] = this.repo[uri];
        }
      });
      return Promise.resolve(result);
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND
    });
  }
  create(uri, value, remote) {
    if (uri) {
      value = Resource.from(value);
      this.repo[uri] = value;
      if (this.updatedUris.indexOf(uri) < 0) {
        this.updatedUris.push(uri);
      }
      this.emit(uri, value, 'created', remote);
      return Promise.resolve();
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND
    });
  }
  delete(uriRegEx, remote) {
    if (uriRegEx) {
      let keysToRemove = Object.keys(this.repo).map((uri) => {
        if (uri.match(uriRegEx)) {
          return uri;
        }
      }).filter(uri => uri);
      keysToRemove.forEach((uri) => {
        if (this.updatedUris.indexOf(uri) < 0) {
          this.updatedUris.push(uri);
        }
        delete this.repo[uri];
        this.emit(uri, null, 'deleted', remote);
      });
      return Promise.resolve();
    }
    return Promise.reject({
      status: COAP_ERROR.COAP_404_NOT_FOUND
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
    let result = {};
    if (uris && uris.length > 0) {
      Object.keys(this.repo).map((uri) => {
        if (uris.indexOf(uri) >= 0) {
          result[uri] = this.repo[uri];
        }
      });
    } else {
      // copy all
      Object.assign(result, this.repo);
    }
    return Promise.resolve(result);
  }
  remoteCreate(uri, value) {
    if (uri) {
      return this.create(uri, value, true);
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
