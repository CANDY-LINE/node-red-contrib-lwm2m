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
import fs from 'fs';
import crypto from 'crypto';
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

const MINIMUM_LIFETIME_SEC = 30;
const HEARTBEAT_MONITOR_INTERVAL_MS = 60 * 1000;

// https://hackernoon.com/functional-javascript-resolving-promises-sequentially-7aac18c4431e
const promiseSerial = promises =>
  promises.reduce((promise, p) =>
    promise.then(result => p.then(Array.prototype.concat.bind(result))),
    Promise.resolve([]));

let emptyValue = '';
export const setEmptyValue = (newVal) => {
  emptyValue = newVal;
};
const getEmptyValue = (defaultVal) => {
  return emptyValue === 'auto' ? defaultVal : emptyValue;
};

const isEmpty = (val) => {
  return (val === '' || val === null || val === undefined);
};
const resolveValue = (val, defaultVal) => {
  return isEmpty(val) ? getEmptyValue(defaultVal) : (val ? val : defaultVal);
};

export class Resource {

  constructor(id, type=LWM2M_TYPE.UNDEFINED, acl=ACL.DEFAULT, value=null, sensitive=null) {
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
      if (!ACL.isAllowed(this.acl, ACL.EXECUTABLE)) {
        this.acl |= ACL.EXECUTABLE;
      }
      delete this.sensitive;
      delete this.value;
    }
    if (!this.value) {
      switch (this.type) {
        case LWM2M_TYPE.INTEGER:
        case LWM2M_TYPE.FLOAT:
          this.value = resolveValue(this.value, 0);
          break;
        case LWM2M_TYPE.BOOLEAN:
          this.value = resolveValue(this.value, false);
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

  /* Promise<Resource> */ destroy() {
    if (this.value && typeof(this.value.fini) === 'function') {
      try {
        return Promise.all([this.value.fini()]).then(() => {
          return this;
        });
      } catch (_) {
        delete this.value;
      }
    }
    return Promise.resolve(this);
  }

  /* Promise<Resource> */ init() {
    this.initialized = true;
    let init;
    if (this.value && typeof(this.value.init) === 'function') {
      init = this.value.init.bind(this.value);
    } else if (typeof(this.value) === 'function') {
      init = this.value.bind(this.value);
    }
    if (init) {
      try {
        return Promise.all([init()]).then((value) => {
          return Resource.from(value[0]);
        }).then((resource) => {
          if (typeof(this.value.get) !== 'function') {
            if (typeof(resource.value) === 'function') {
              this.value = resource.value.bind(resource.value);
            } else {
              this.value = resource.value;
            }
          }
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
        return this.value.get();
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
        this.value.set(newValue);
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
            this.value = resource.toInteger(true);
            break;
          case LWM2M_TYPE.FLOAT:
            this.value = resource.toFloat(true);
            break;
          case LWM2M_TYPE.BOOLEAN:
            this.value = resource.toBoolean(true);
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
    const val = this.toValue();
    switch (this.type) {
      case LWM2M_TYPE.STRING:
        return val;
      case LWM2M_TYPE.BOOLEAN:
        return val ? '1' : '0';
      default:
        if (val === null || typeof(val) === 'undefined') {
          return null;
        }
        return val.toString();
    }
  }

  toBuffer() {
    const val = this.toValue();
    return Resource.toBuffer(val);
  }

  bufferToFloat(buff) {
    if (buff.length === 4) {
      return buff.readFloatBE(0);
    } else if (buff.length === 8) {
      return buff.readDoubleBE(0);
    } else {
      return 0;
    }
  }

  toFloat(allowEmpty=false) {
    const val = this.toValue();
    if (allowEmpty && isEmpty(val)) {
      return getEmptyValue(0);
    }
    switch (this.type) {
      case LWM2M_TYPE.FLOAT:
      case LWM2M_TYPE.INTEGER:
        return val;
      case LWM2M_TYPE.BOOLEAN:
        return val ? 1.0 : 0.0;
      case LWM2M_TYPE.OPAQUE:
        if (typeof(val) === 'number') {
          return val;
        } else if (Buffer.isBuffer(val)) {
          return this.bufferToFloat(val);
        } else if (typeof val === 'string') {
          if (val.indexOf('hex:') === 0) {
            return this.bufferToFloat(Buffer.from(val.substring(4), 'hex'));
          } else if (val.indexOf('base64:') === 0) {
            return this.bufferToFloat(Buffer.from(val.substring(4), 'base64'));
          }
        }
        return parseFloat(val);
      default:
        return val ? parseFloat(val.toString()) : 0.0;
    }
  }

  toInteger(allowEmpty=false) {
    const val = this.toValue();
    if (allowEmpty && isEmpty(val)) {
      return getEmptyValue(0);
    }
    switch (this.type) {
      case LWM2M_TYPE.FLOAT:
        return parseInt(val);
      case LWM2M_TYPE.INTEGER:
        return val;
      case LWM2M_TYPE.BOOLEAN:
        return val ? 1 : 0;
      case LWM2M_TYPE.OPAQUE:
        if (typeof(val) === 'number') {
          return parseInt(val);
        } else if (Buffer.isBuffer(val)) {
          return parseInt(val.toString('hex'), 16);
        } else if (typeof val === 'string') {
          if (val.indexOf('hex:') === 0) {
            parseInt(val.substring(4), 16);
          } else if (val.indexOf('base64:') === 0) {
            parseInt(Buffer.from(val.substring(4), 'base64').toString('hex'), 16);
          }
        }
        return parseInt(val);
      default:
        return val ? parseInt(val.toString()) : 0;
    }
  }

  toBoolean(allowEmpty=false) {
    const val = this.toValue();
    if (allowEmpty && isEmpty(val)) {
      return getEmptyValue(false);
    }
    switch (this.type) {
      case LWM2M_TYPE.BOOLEAN:
        return val;
      case LWM2M_TYPE.OPAQUE:
        return !!val[0];
      case LWM2M_TYPE.STRING:
        return (!val || val === '0') ? false : true;
      default:
        return !!val;
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
        value = packet.length === 0 ? getEmptyValue(0) : parseInt(packet.toString());
        break;
      case LWM2M_TYPE.FLOAT:
        value = packet.length === 0 ? getEmptyValue(0) : parseFloat(packet.toString());
        break;
      case LWM2M_TYPE.BOOLEAN:
        value = packet.length === 0 ? getEmptyValue(false) : packet[0] === 0x01;
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
        value = Buffer.from(String(resolveValue(value, 0)));
        break;
      case LWM2M_TYPE.FLOAT:    // strtod:double
        value = Buffer.from(String(resolveValue(value, 0)));
        break;
      case LWM2M_TYPE.OPAQUE:
        value = Resource.toBuffer(value);
        break;
      case LWM2M_TYPE.BOOLEAN:
        const booleanVal = resolveValue(value, false);
        if (typeof(booleanVal) === 'boolean') {
          value = Buffer.from([booleanVal ? 1 : 0]);
        } else {
          value = Buffer.from(booleanVal);
        }
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

  clone() {
    return Resource.build(this);
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
      } else if (typeof(value) === 'number') {
        if (value % 1 === 0) {
          return Buffer.from([value]);
        } else {
          const f = new Float32Array(1);
          f[0] = value;
          return Buffer.from(f.buffer);
        }
      } else {
        return Buffer.from(value);
      }
    } else if (typeof(value) === 'boolean') {
      return Buffer.from([value ? 0 : 1]);
    }
    return value;
  }

  static build(id, type=LWM2M_TYPE.UNDEFINED, acl=ACL.DEFAULT, value=null, sensitive=false) {
    return new Resource(id, type, acl, value, sensitive);
  }

  static /* Promise */ from(resource) {
    if ((resource instanceof Resource) && resource.initialized) {
      return Promise.resolve(resource);
    }
    switch (typeof(resource)) {
      case 'string':
        return Resource.build({
          type: 'STRING',
          value: resource || ''
        }).init();
      case 'number':
        return Resource.build({
          type: (String(resource).indexOf('.') >= 0) ? 'FLOAT' : 'INTEGER',
          value: resolveValue(resource, 0)
        }).init();
      case 'boolean':
        return Resource.build({
          type: 'BOOLEAN',
          value: resolveValue(resource, !!resource)
        }).init();
      default:
        if (Buffer.isBuffer(resource)) {
          return Resource.build({
            type: 'OPAQUE',
            value: resource || Buffer.from([])
          }).init();
        } else if (Array.isArray(resource)) {
          return Promise.all(resource.map((r) => Resource.from(r))).then((values) => {
            let newValue = values.reduce((p, c, i) => {
              p[i] = c;
              return p;
            }, {});
            return Resource.build({
              type: 'MULTIPLE_RESOURCE',
              value: newValue
            }).init();
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
              }).init();
            });
          });
        } else {
          return Resource.build(resource).init();
        }
    }
  }
}

class CredUtils {

  static decryptCredentials(/* string */ key, enc) {
    const value = enc.$;
    const iv = Buffer.from(value.substring(0, 32),'hex');
    const secret = crypto.createHash('sha256').update(key).digest();
    const creds = value.substring(32);
    const decipher = crypto.createDecipheriv('aes-256-ctr', secret, iv);
    const data = decipher.update(creds, 'base64', 'utf8') + decipher.final('utf8');
    return JSON.parse(data);
  }

  static encryptCredentials(/* string */ key, credentials) {
    const iv = crypto.randomBytes(16);
    const secret = crypto.createHash('sha256').update(key).digest();
    const cipher = crypto.createCipheriv('aes-256-ctr', secret, iv);
    return {
      '$': iv.toString('hex') +
        cipher.update(JSON.stringify(credentials), 'utf8', 'base64') +
        cipher.final('base64')};
  }

  static loadCredentials(credentialFilePath, /* string */ key) {
    if (!credentialFilePath || !key) {
      return null;
    }
    try {
      const data = fs.readFileSync(credentialFilePath, 'utf-8');
      const enc = JSON.parse(data.toString());
      return CredUtils.decryptCredentials(key, enc);
    } catch (_) {
      CredUtils.deleteCredentials(credentialFilePath);
      return null;
    }
  }

  static saveCredentials(credentialFilePath, /* string */ key, credentials) {
    if (!credentialFilePath || !key) {
      return false;
    }
    const cred = CredUtils.encryptCredentials(key, credentials);
    fs.writeFileSync(credentialFilePath, JSON.stringify(cred), 'utf-8');
    return true;
  }

  static deleteCredentials(credentialFilePath) {
    try {
      fs.unlinkSync(credentialFilePath);
      return true;
    } catch (_) {
      return false;
    }
  }
}

export class ResourceRepositoryBuilder {
  constructor(inputJson=[], addDefaultRepo=true, credentialFilePath='', key='') {
    if (!Array.isArray(inputJson)) {
      inputJson = [inputJson];
    }
    const credentials = CredUtils.loadCredentials(credentialFilePath, key);
    if (credentials) {
      inputJson.splice(0, 0, credentials);
      this.credentialsLoaded = true;
    }
    if (addDefaultRepo) {
      inputJson.push(DEFAULT_REPO);
    }
    // merge all objects
    this.json = {};
    inputJson.forEach((objects) => {
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

  static destroy(repo) {
    if (!repo) {
      return Promise.resolve();
    }
    return Promise.all(Object.keys(repo).filter(uri => /^\/[0-9\/]+/.test(uri)).map((uri) => {
      const resource = repo[uri];
      if (resource.destroy && typeof(resource.destroy) === 'function') {
        return resource.destroy().catch((err) => console.log(err));
      }
    }));
  }

  build(opts={}) {
    const repo = {
      extraObjectIdArray: [],
      hideSensitiveInfo: opts.hideSensitiveInfo,
      definitions: opts.definitions || {}
    };
    let p = [];
    const overlaidObjects = [-1, -1, []]; // for Security/Server/ACL objects
    const intSorter = (a, b) => a - b;
    const intMapper = k => parseInt(k);
    Object.keys(this.json).map(intMapper).sort(intSorter).forEach((objectId) => {
      const instances = this.json[objectId];
      if (typeof(instances) !== 'object') {
        return;
      }
      objectId = LWM2M_OBJECT_ID.toType(objectId, objectId);
      if (objectId > LWM2M_OBJECT_ID.DEVICE) {
        repo.extraObjectIdArray.push(objectId);
      }
      if (!repo.definitions[objectId]) {
        repo.definitions[objectId] = {};
      }
      const objectDefinition = repo.definitions[objectId];
      Object.keys(instances).map(intMapper).sort(intSorter).forEach((objectInstanceId) => {
        const resources = instances[objectInstanceId];
        if (typeof(resources) !== 'object') {
          return;
        }
        const uriBase = `/${objectId}/${objectInstanceId}`;
        Object.keys(resources).map(intMapper).sort(intSorter).forEach((resourceId) => {
          p.push(Resource.from(resources[resourceId]).then((resource) => {
            // Replace ServerID to Security, Server and ACL objects where its value is 0
            switch (objectId) {
              case LWM2M_OBJECT_ID.SECURITY: {
                if (overlaidObjects[LWM2M_OBJECT_ID.SECURITY] < 0 &&
                    (/* Server ID */ resourceId === 10) && (resource.toInteger() < 1)) {
                  overlaidObjects[LWM2M_OBJECT_ID.SECURITY] = objectInstanceId;
                }
                break;
              }
              case LWM2M_OBJECT_ID.SERVER: {
                if (overlaidObjects[LWM2M_OBJECT_ID.SERVER] < 0 &&
                    (/* Server ID */ resourceId === 0) && (resource.toInteger() < 1)) {
                  overlaidObjects[LWM2M_OBJECT_ID.SERVER] = objectInstanceId;
                }
                break;
              }
              case LWM2M_OBJECT_ID.ACL: {
                if ((/* Server ID */ resourceId === 3) && (resource.toInteger() < 1)) {
                  overlaidObjects[LWM2M_OBJECT_ID.ACL].push(objectInstanceId);
                }
                break;
              }
              default:
            }
            const uri = `${uriBase}/${resourceId}`;
            resource.id = resourceId;
            repo[uri] = resource;

            if (!objectDefinition[resourceId]) {
              objectDefinition[resourceId] = resource.clone();
            }
          }));
        });
      });
    });
    return Promise.all(p).then(() => {
      if (!this.credentialsLoaded && this.json[LWM2M_OBJECT_ID.SECURITY] && overlaidObjects[LWM2M_OBJECT_ID.SECURITY] >= 0) {
        this._applyOptionsToSecurityObject(overlaidObjects, opts, repo);
      }
      if (!this.credentialsLoaded && this.json[LWM2M_OBJECT_ID.SERVER] && overlaidObjects[LWM2M_OBJECT_ID.SERVER] >= 0) {
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
      if (!opts.pskIdentity || !opts.presharedKey) {
        throw new Error(`Cannot start in DTLS mode becasue of invalid PSK configuration`);
      }
      uriPrefix = 'coaps://';
      repo[`${securityUriPrefix}/2`].value = 0; // PSK
      repo[`${securityUriPrefix}/3`] = Resource.build({type: 'OPAQUE', value: opts.pskIdentity});
      repo[`${securityUriPrefix}/5`] = Resource.build({type: 'OPAQUE', value: `hex:${opts.presharedKey}`});
    } else {
      repo[`${securityUriPrefix}/2`].value = 3; // NONE
    }
    if (opts.serverHost && opts.serverPort) {
      repo[`${securityUriPrefix}/0`].value = `${uriPrefix}${opts.serverHost}:${opts.serverPort}`;
    } else {
      repo[`${securityUriPrefix}/0`].value = '';
    }
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
        repo[`${aclUriPrefix}/2`].value[opts.serverId] = Resource.build({type: 'INTEGER', value: ACL.ALL});
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
    const resp = `/resp:${this.command}:${this.response.toString('base64')}`;
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
      this.client.log(`[Read] (${this.uris}) Error Message:${err.message || ''}`, { payload: err });
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
    const resources = {};
    let resourcePayload = payload.slice(8);
    while (resourcePayload.length > 0) {
      resourcePayload = Resource.parse(resources, resourcePayload);
    }
    Object.keys(resources).forEach((id) => {
      const resource = resources[id];
      const uri = `/${this.objectId}/${this.objectInstanceId}/${resource.id}`;
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
      this.client.log(`[Write] (${JSON.stringify(this.params)}) URI:${err.uri} Error Message:${err.message || ''}`, { payload: err });
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
    const uri = `/${this.objectId}/${this.objectInstanceId}/${this.resourceId}`;
    return this.client.objectStore.remoteExecute(uri, this.param).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.log(`[Execute] (${uri}) Error Message:${err.message || ''}`, { payload: err });
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
    let newState = StateChanged.STATE_TABLE[this.stateLabel];
    if (newState) {
      this.client.previousState = this.client.state;
      this.client.state = newState;
      this.client.emit(newState);
    }
    return Promise.resolve({
      status: COAP_ERROR.COAP_IGNORE
    });
  }

}

StateChanged.STATE_TABLE = {
  STATE_INITIAL: 'started',
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
    const resources = {};
    let resourcePayload = payload.slice(8);
    while (resourcePayload.length > 0) {
      resourcePayload = Resource.parse(resources, resourcePayload);
    }
    Object.keys(resources).forEach((id) => {
      const resource = resources[id];
      const uri = `/${this.objectId}/${this.objectInstanceId}/${resource.id}`;
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
      this.client.log(`[Create] (${JSON.stringify(this.params)}) Error Message:${err.message || ''}`, { payload: err });
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
      this.client.log(`[Delete] (${this.param}) Error Message:${err.message || ''}`, { payload: err });
      super.setStatus(err.status || COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

class Backup extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
  }

  perform() {
    super.setResourceLen(0);
    this.client.debug(`<Backup> this.objectId=>${this.objectId}`);
    return this.client.objectStore.backup(this.objectId).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.log(`[Backup] (/${this.objectId}) Error Message:${err.message || ''}`, { payload: err });
      super.setStatus(err.status || COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

class Restore extends RequestHandler {

  constructor(client, command, payload) {
    super(client, command, payload);
  }

  perform() {
    super.setResourceLen(0);
    this.client.debug(`<Restore> this.objectId=>${this.objectId}`);
    return this.client.objectStore.restore(this.objectId).then(() => {
      return super.perform();
    }).catch((err) => {
      this.client.log(`[Restore] (/${this.objectId}) Error Message:${err.message || ''}`, { payload: err });
      super.setStatus(err.status || COAP_ERROR.COAP_400_BAD_REQUEST);
      return super.perform();
    });
  }

}

class ReadInstances {

  constructor(client, command, payload) {
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

    this.response = Buffer.from([
      0x02, // response data type
      this.messageId,
      COAP_ERROR.COAP_205_CONTENT, // result status code
      payload[2],
      payload[3],
      0,
      0 // Instance Id list size
    ]);
    this.uris = [`^/${this.objectId}/[0-9]+/[0-9]+$`];
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

  sendResponse() {
    const resp = `/resp:${this.command}:${this.response.toString('base64')}`;
    return Promise.resolve({
      status: this.getStatus(),
      payload: resp
    });
  }

  resolveInstanceIdList(resources) {
    const instanceIdList = [];
    resources.forEach(r => {
      const uri = r.uri;
      const instanceId = parseInt(uri.substring(uri.indexOf('/', 1) + 1, uri.lastIndexOf('/')));
      if (instanceIdList.indexOf(instanceId) < 0) {
        instanceIdList.push(instanceId);
      }
    });
    return instanceIdList;
  }

  perform() {
    return this.client.objectStore.remoteGet(this.uris).then((resources) => {
      if (resources.length === 0) {
        this.client.debug(`<ReadInstances> No resource for objectId=${this.objectId}`);
        this.setStatus(COAP_ERROR.COAP_404_NOT_FOUND);
        return this.sendResponse();
      }
      this.client.debug(`<ReadInstances> uris=>${this.uris}, response=>${JSON.stringify(resources)}`);
      const instanceIdList = this.resolveInstanceIdList(resources);
      if (instanceIdList.length === 0) {
        this.client.debug(`<ReadInstances> No instance for objectId=${this.objectId}`);
        this.setStatus(COAP_ERROR.COAP_404_NOT_FOUND);
        return this.sendResponse();
      }
      this.client.debug(`<ReadInstances> Instance ID(s): ${JSON.stringify(instanceIdList)} found in objectId=${this.objectId}`);
      // Instance ID list size
      this.response[5] = instanceIdList.length & 0xff;
      this.response[6] = (instanceIdList.length >> 8) & 0xff;
      // build response
      let res = this.response;
      instanceIdList.forEach(instanceId => {
        res = Buffer.concat([
          res,
          Buffer.from([
            instanceId & 0xff,
            (instanceId >> 8) & 0xff
          ])
        ]);
      });
      this.response = res;
      return this.sendResponse();

    }).catch((e) => {
      const err = {
        status: e.status || COAP_ERROR.COAP_400_BAD_REQUEST,
        message: e.message
      };
      this.client.debug(`<ReadInstances> error => ${e.message} ${e.stack}`);
      this.client.log(`[ReadInstances] (${this.uris}) Error Message:${err.message || ''}`, { payload: err });
      this.setStatus(err.status);
      return this.sendResponse();
    });
  }

}

class HeartbeatRequest extends RequestHandler {

  constructor(client, command) {
    super(client, command);
    this.setStatus(COAP_ERROR.COAP_IGNORE);
    this.client.ping();
  }

}

RequestHandler.build = (client, command, payload) => {
  switch (command) {
    case 'heartbeat':
      return new HeartbeatRequest(client, command);
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
    // not lwm2m commands
    case 'backup':
      return new Backup(client, command, payload);
    case 'restore':
      return new Restore(client, command, payload);
    case 'stateChanged':
      return new StateChanged(client, command, payload);
    case 'readInstances':
      return new ReadInstances(client, command, payload);
    default:
      return new IgnoreRequest(client, command);
  }
};

export class LwM2MClientProxy extends EventEmitter {

  constructor(opts={}) {
    super();
    this.clientName = opts.clientName;
    this.clientPort = opts.clientPort;
    this.useIPv4 = opts.useIPv4;
    this.log = opts.log ? opts.log.bind(opts) : console.log;
    this.trace = opts.trace ? opts.trace.bind(opts) : console.log;
    this.debug = opts.debug ? opts.debug.bind(opts) : console.log;
    this.error = opts.error ? opts.error.bind(opts) : console.error;
    this.objectStore = opts.objectStore || {};
    this.requestBootstrap = opts.requestBootstrap;
    this.saveProvisionedConfig = opts.saveProvisionedConfig;
    this.reconnectSec = opts.reconnectSec || 60;
    this.redirectLwm2mClientLog = opts.redirectLwm2mClientLog;
    this.dumpLwm2mMessages = opts.dumpLwm2mMessages;
    this.autoReconnect = (this.reconnectSec > 0);
    this.autoReconnectTask = null;
    this.previousState = null;
    this.state = StateChanged.STATE_TABLE.STATE_INITIAL;
    this.credentialFilePath = opts.credentialFilePath;
    this.secret = opts.secret;
    this.lastPingAt = 0;

    if (!this.saveProvisionedConfig) {
      CredUtils.deleteCredentials(this.credentialFilePath);
      this.debug(`<stdout> [saveProvisionedConfig=>false] Deleting credentials file!`);
    }

    this.on('connected', () => {
      if (this.requestBootstrap && this.saveProvisionedConfig) {
        this.objectStore.createCredentials().then((credentials) => {
          const done = CredUtils.saveCredentials(this.credentialFilePath, this.secret, credentials);
          this.debug(`<stdout> Saving credentials file => ${done ? 'OK' : 'FAIL'}!`);
        });
      }
      this.objectStore.updateServerId();
    });
    this.on('disconnected', (state) => {
      this.debug(`<stdout> Exit state => ${state}`);
      if (StateChanged.STATE_TABLE.STATE_BOOTSTRAP_REQUIRED === state ||
          StateChanged.STATE_TABLE.STATE_INITIAL === state) {
        const done = CredUtils.deleteCredentials(this.credentialFilePath);
        this.debug(`<stdout> Deleting credentials file => ${done ? 'OK' : 'FAIL'}!`);
      }
    });
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
    if (this.hearbeatMonitor) {
      clearTimeout(this.hearbeatMonitor);
    }
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
    }).then(() => {
      if (this.objectStore) {
        return this.objectStore.shutdown();
      }
    });
  }

  ping() {
    this.lastPingAt = Date.now();
  }

  start() {
    let processPath = `${CLIENT_PATH}/wakatiwaiclient`;
    const args = [];
    if (process.env.ENABLE_VALGRIND === 'true') {
      args.push('--leak-check=yes');
      args.push(processPath);
      processPath = 'valgrind';
    }

    args.push('-n');
    args.push(this.clientName);
    if (this.useIPv4) {
      args.push('-4');
    }
    if (this.redirectLwm2mClientLog && this.dumpLwm2mMessages) {
      args.push('-d');
    }
    args.push('-l');
    args.push(this.clientPort);
    args.push('-o');
    args.push(this.objectStore.getExtraObjectIDArray().join(','));

    // This function call may throw an exception on error
    this.cproc = cproc.spawn(processPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', this.redirectLwm2mClientLog ? process.stderr : 'ignore']
    });
    if (this.autoReconnectTask) {
      clearTimeout(this.autoReconnectTask);
      this.autoReconnectTask = null;
    }
    this.cproc.on('exit', (code) => {
      this.log(`Process Exit: pid => ${this.cproc.pid}, code => ${code}, state => ${this.state}, autoReconnect => ${this.autoReconnect} (after ${this.reconnectSec} sec.)`);
      this.cproc = null;
      this.emit('disconnected', this.state);
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

    const setupHeartbeatMonitor = () => {
      this.hearbeatMonitor = setTimeout(() => {
        if (this.isConnected() && (Date.now() - this.lastPingAt >= HEARTBEAT_MONITOR_INTERVAL_MS)) {
          this.log(`Kill the wakatiwai client as it is no longer responding.`);
          this.cproc.kill('SIGKILL');
        } else {
          setupHeartbeatMonitor();
        }
      }, HEARTBEAT_MONITOR_INTERVAL_MS);
    };
    setupHeartbeatMonitor();
  }
}

export class LwM2MObjectStore {
  constructor(opts) {
    this.repo = null;
    this.serverId = opts.serverId;
    this.propagator = opts;
    this.updatedUris = [];
    this.backupObjects = {};
  }
  shutdown() {
    return ResourceRepositoryBuilder.destroy(this.repo);
  }
  getExtraObjectIDArray() {
    return this.repo ? this.repo.extraObjectIdArray.slice() : [];
  }
  updateServerId() {
    return this.get('/0/0/10').then((serverId) => {
      const shortId = serverId[0].value.value;
      this.serverId = shortId;
      return shortId;
    });
  }
  createCredentials() {
    if (!this.repo) {
      return Promise.resolve([]);
    }
    return this.get('/(0|1|2)/.*').then((result) => {
      const objects = {};
      result.forEach((resource) => {
        const uri = resource.uri.split('/');
        if (!objects[/* objectId */ uri[1]]) {
          objects[/* objectId */ uri[1]] = {};
        }
        const o = objects[/* objectId */ uri[1]];
        if (!o[/* instanceId */ uri[2]]) {
          o[/* instanceId */ uri[2]] = {};
        }
        const i = o[/* instanceId */ uri[2]];
        i[/* resourceId */ uri[3]] = resource.value;
      });
      return objects;
    });
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
  backup(objectId) {
    return this.get(`^/${objectId}/.*$`).then((result) => {
      const cleaner = setTimeout(() => {
        delete this.backupObjects[objectId];
      }, 60 * 1000);
      this.backupObjects[objectId] = {
        repo: result, // toJSON() output
        cleaner: cleaner
      };
      this.emit(`/${objectId}`, null, 'backedUp', false);
    });
  }
  restore(objectId) {
    const backup = this.backupObjects[objectId];
    if (!backup) {
      return Promise.resolve();
    }
    clearTimeout(backup.cleaner);
    delete this.backupObjects[objectId];

    return this.delete(`^/${objectId}/.*$`).catch((err) => {
      if (err.status === COAP_ERROR.COAP_404_NOT_FOUND) {
        return;
      }
      return Promise.reject(err);
    }).then(() => {
      return Promise.all(backup.repo.map((entry) => {
        return Resource.from(entry.value).then(r => {
          this.repo[entry.uri] = r;
        });
      })).then(() => {
        this.emit(`/${objectId}`, null, 'restored', false);
      });
    });
  }
  _verifyValues(uri) {
    const resource = this.repo[uri];
    if (!resource) {
      return;
    }
    if (uri.match('^/1/[0-9]+/1$') /* lifetime */) {
      if (resource.toInteger() < MINIMUM_LIFETIME_SEC) {
        resource.value = MINIMUM_LIFETIME_SEC;
      }
    }
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
    if (uri) {
      let p;
      let resource = this.repo[uri];
      if (resource === undefined) {
        p = Resource.from(value).then(r => {
          const ids = uri.split('/').splice(1);
          const objectDefinition = this.repo.definitions[ids[0]];
          if (objectDefinition) {
            const resourceDefinition = objectDefinition[ids[2]];
            if (resourceDefinition) {
              const newValue = r;
              r = resourceDefinition.clone();
              this.repo[uri] = r;
              return r.update(newValue, remote ? this.serverId : undefined);
            }
          }
          this.repo[uri] = r;
        });
      } else {
        p = resource.update(value, remote ? this.serverId : undefined);
      }
      return p.then(() => {
        this._verifyValues(uri);
        if (this.updatedUris.indexOf(uri) < 0) {
          this.updatedUris.push(uri);
        }
        this.emit(uri, resource, 'updated', remote);
        return Promise.resolve();
      }).catch((err) => {
        err.uri = uri;
        err.value = value;
        err.operation = 'write';
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
  get(uriRegEx, result=[], remote=false) {
    if (!this.repo) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.get(uriRegEx, result, remote).then((out) => {
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
          if (remote && this.repo.hideSensitiveInfo && this.repo[uri].sensitive) {
            return;
          }
          result.push({
            uri: uri,
            value: remote ? this.repo[uri].clone() : this.repo[uri].toJSON()
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
        const ids = uri.split('/').splice(1);
        const objectDefinition = this.repo.definitions[ids[0]];
        if (objectDefinition) {
          const resourceDefinition = objectDefinition[ids[2]];
          if (resourceDefinition) {
            const newValue = resource;
            resource = resourceDefinition.clone();
            return resource.update(newValue, remote ? this.serverId : undefined).then(() => resource);
          }
        }
        return Promise.resolve(resource);
      }).then(resource => {
        this.repo[uri] = resource;
        this._verifyValues(uri);
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
            if (this.repo[uri]) {
              this.repo[uri].destroy();
              delete this.repo[uri];
              this.emit(uri, null, 'deleted', remote);
            }
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
        const value = params[uri];
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
