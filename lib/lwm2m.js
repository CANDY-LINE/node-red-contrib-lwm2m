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

'use strict';

import 'source-map-support/register';
import {
  ResourceRepositoryBuilder, LwM2MClientProxy, LwM2MObjectStore, setEmptyValue
} from './lwm2m-common';

const GREEN_EVENTS = ['connected'];
const BLUE_EVENTS = ['bootstrapRequired', 'bootstrapping', 'registerRequired', 'registering'];
const RED_EVENTS = ['disconnected', 'error', 'timeout'];
const ALL_EVENTS = GREEN_EVENTS.concat(BLUE_EVENTS).concat(RED_EVENTS);

export default function(RED) {

  let lwm2mClients = {};
  function createKey(host, port, endpoint) {
    return host + ':' + port + '/' + endpoint;
  }
  let exitHandler = () => {
    Object.keys(lwm2mClients).forEach((key) => {
      lwm2mClients[key].operations.shutdown();
    });
  };
  process.on('exit', exitHandler);
  if (RED.settings && RED.settings.exitHandlers) {
    RED.settings.exitHandlers.push(exitHandler);
  }
  const lwm2m = (RED.settings.lwm2m || {});
  setEmptyValue(lwm2m.emptyValue || '');

  class LwM2MClientNode {
    constructor(n) {
      RED.nodes.createNode(this, n);
      this.disabled = !!n.disabled;
      this.lazyStart = !!n.lazyStart;
      this.clientName = n.clientName;
      this.enableDTLS = !!n.enableDTLS;
      const clientPort = parseInt(n.clientPort);
      this.clientPort = isNaN(clientPort) ? 56830 : clientPort;
      this.lifetimeSec = parseInt(n.lifetimeSec) || 300;
      this.reconnectSec = parseInt(n.reconnectSec) || 60;
      this.bootstrapIntervalSec = parseInt(n.bootstrapIntervalSec) || 3600;
      if (this.bootstrapIntervalSec < 60) {
        this.bootstrapIntervalSec = 60;
      }
      this.requestBootstrap = !!n.requestBootstrap;
      this.saveProvisionedConfig = !!n.saveProvisionedConfig;
      this.useIPv4 = !!n.useIPv4;
      this.maxRecvPacketSize = n.maxRecvPacketSize || 1152;
      this.redirectLwm2mClientLog = !!n.redirectLwm2mClientLog;
      this.dumpLwm2mMessages = !!n.dumpLwm2mMessages;
      this.hideSensitiveInfo = !!n.hideSensitiveInfo;
      this.propagateInternalEvents = !!n.propagateInternalEvents;
      this.pskIdentity = (this.credentials || {}).pskIdentity || '';
      this.presharedKey = (this.credentials || {}).presharedKey || '';
      this.serverId = parseInt(n.serverId) || 99;
      this.serverHost = n.serverHost;
      this.serverPort = parseInt(n.serverPort) || (this.enableDTLS ? 5684 : 5683);
      this.objects = n.objects || '';
      this.secret = RED.settings.get('credentialSecret');
      if (!this.secret) {
        this.secret = RED.settings.get('_credentialSecret');
      }
      let key = createKey(this.serverHost, this.serverPort, this.clientName);
      if (lwm2mClients[key]) {
        throw new Error(RED._('lwm2m.error.duplicateEntry', { host: this.serverHost, port: this.serverPort, endpoint: this.clientName }));
      }
      if (Object.keys(lwm2mClients).filter((k) => lwm2mClients[k].clientPort === this.clientPort).length > 0) {
        throw new Error(RED._('lwm2m.error.duplicateClientPort', { port: this.clientPort, clientName: this.clientName }));
      }
      lwm2mClients[key] = this;
      this.nodes = {};
      let self = this;
      if (!this.disabled && this.propagateInternalEvents && lwm2m.internalEventBus && typeof(lwm2m.internalEventBus.emit) === 'function') {
        this.internalEventBus = lwm2m.internalEventBus;
        this.setMaxListeners(this.getMaxListeners() + 1);
        this.on('clientStateChanged', (newState) => {
          this.internalEventBus.emit('clientStateChanged', newState);
        });
        this.on('object-event', (ev) => {
          this.internalEventBus.emit('object-event', ev);
        });
        if (this.internalEventBus.listenerCount('object-read') === 0) {
          this.internalEventBusMaxListeners = this.internalEventBus.getMaxListeners();
          this.internalEventBus.setMaxListeners(this.internalEventBusMaxListeners + 4);
          this.internalEventBus.on('object-read', (msg={}) => {
            const evList = ['object-result'];
            if (msg.id) {
              evList.push(`object-read-${msg.id}`);
            }
            this.objectStore.get(msg.topic).then((result) => {
              evList.forEach((ev) => {
                this.internalEventBus.emit(ev, {
                  id: msg.id,
                  type: 'object-read',
                  payload: result
                });
              });
            }).catch((err) => {
              evList.forEach((ev) => {
                this.internalEventBus.emit(ev, {
                  id: msg.id,
                  type: 'object-read',
                  payload: err,
                  error: true });
              });
            });
          });
          this.internalEventBus.on('object-write', (msg={}) => {
            const evList = ['object-result'];
            if (msg.id) {
              evList.push(`object-write-${msg.id}`);
            }
            this.objectStore.write(msg.topic, msg.payload, false).then(() => {
              evList.forEach((ev) => {
                this.internalEventBus.emit(ev, {
                  id: msg.id,
                  type: 'object-write'
                });
              });
            }).catch((err) => {
              evList.forEach((ev) => {
                this.internalEventBus.emit(ev, {
                  id: msg.id,
                  type: 'object-write',
                  payload: err,
                  error: true
                });
              });
            });
          });
          this.internalEventBus.on('object-execute', (msg={}) => {
            let topic = msg.topic || '';
            let execute = topic.indexOf('/execute');
            if (execute >= 0) {
              topic = msg.topic.substring(0, execute);
            }
            const evList = ['object-result'];
            if (msg.id) {
              evList.push(`object-execute-${msg.id}`);
            }
            this.objectStore.execute(topic, msg.payload, false).then(() => {
              evList.forEach((ev) => {
                this.internalEventBus.emit(ev, {
                  id: msg.id,
                  type: 'object-execute'
                });
              });
            }).catch((err) => {
              evList.forEach((ev) => {
                this.internalEventBus.emit(ev, {
                  id: msg.id,
                  type: 'object-execute',
                  payload: err,
                  error: true
                });
              });
            });
          });
        }
      }
      this.operations = {
        init() {
          let json = lwm2m.objects || {};
          if (Array.isArray(json)) {
            self.warn(`stored objects JSON must be Object rather than Array`);
            json = {};
          }
          let initialObjects = {};
          try {
            initialObjects = JSON.parse(self.objects);
            if (Array.isArray(initialObjects)) {
              self.warn(`'Objects' property must be Object rather than Array`);
              initialObjects = {};
            }
          } catch (_) {}
          return new Promise((resolve) => {
            if (!self.disabled && self.propagateInternalEvents && self.internalEventBus) {
              self.internalEventBus.once('configurationDone', (config) => {
                self.debug(`[configurationDone] config => ${JSON.stringify(config)}`);
                if (config && config.clientName) {
                  self.clientName = config.clientName;
                }
                self.log(`ClientName resolved => ${self.clientName}`);
                [
                  'enableDTLS', 'clientPort', 'lifetimeSec', 'reconnectSec',
                  'bootstrapIntervalSec',
                  'requestBootstrap', 'saveProvisionedConfig', 'useIPv4',
                  'redirectLwm2mClientLog', 'dumpLwm2mMessages', 'hideSensitiveInfo',
                  'pskIdentity', 'presharedKey',
                  'serverId', 'serverHost', 'serverPort',
                  'credentialFilePath'
                ].forEach((key) => {
                  if (config[key] !== undefined) {
                    self[key] = config[key];
                  }
                });

                return resolve();
              });
              if (self.internalEventBus.emit('configure', {
                clientName: self.clientName
              })) {
                self.log(`Configuring lwm2m node...`);
              } else {
                self.internalEventBus.removeAllListeners('configurationDone');
                self.log(`ClientName resolved => ${self.clientName}`);
                return resolve();
              }
            } else {
              return resolve();
            }
          }).then(() => {
            self.credentialFilePath = self.credentialFilePath || `${RED.settings.userDir}/lwm2m_${encodeURIComponent(self.clientName)}_cred.json`;
            self.objectStore = new LwM2MObjectStore(self);
            self.client = new LwM2MClientProxy(self);
            ALL_EVENTS.forEach(ev => {
              self.client.setMaxListeners(self.client.getMaxListeners() + 1);
              self.client.on(ev, () => {
                try {
                  Object.keys(self.nodes).forEach(id => {
                    self.nodes[id].emit(ev);
                  });
                } catch (e) {
                  self.warn(e);
                }
                if (self.propagateInternalEvents && self.internalEventBus) {
                  self.internalEventBus.emit(ev);
                }
              });
            });
            return new ResourceRepositoryBuilder(
              [json, initialObjects], true, self.credentialFilePath, self.secret).build(self).then((repo) => {
              self.objectStore.repo = repo;
            }).catch((err) => {
              if (err instanceof Error) {
                self.log(err);
              }
              self.error(`lwm2m error`, { payload: err });
            });
          });
        },
        startClient() {
          if (!self.client) {
            throw new Error(`Not yet initialized!`);
          }
          if (self.client.isConnected()) {
            return;
          }
          self.client.start();
        },
        stopClient() {
          if (!self.client) {
            throw new Error(`Not yet initialized!`);
          }
          if (!self.client.isConnected()) {
            return;
          }
          self.client.shutdown({ deregister: false });
        },
        deregisterClient() {
          if (!self.client) {
            throw new Error(`Not yet initialized!`);
          }
          if (!self.client.isConnected()) {
            return;
          }
          self.client.shutdown({ deregister: true });
        },
        register(node) {
          if (node) {
            if (self.nodes[node.id]) {
              return false;
            }
            self.nodes[node.id] = node;
            if (self.client && self.client.isConnected()) {
              node.emit('connected');
            }
            return true;
          }
          return false;
        },
        remove(node) {
          if (node) {
            if (self.nodes[node.id]) {
              delete self.nodes[node.id];
              return true;
            }
          }
          return false;
        },
        shutdown() {
          if (self.propagateInternalEvents && self.internalEventBus) {
            self.internalEventBus.setMaxListeners(self.internalEventBusMaxListeners);
            [
              'object-read',
              'object-write',
              'object-execute',
              'configurationDone',
              'clientStateChanged'
            ].forEach((ev) => {
              self.internalEventBus.removeAllListeners(ev);
            });
          }
          if (self.client) {
            return self.client.shutdown();
          } else {
            return Promise.resolve();
          }
        }
      };
      if (this.disabled) {
        this.warn(`The client [${this.clientName}] won't run as disabled.`);
      } else {
        this.operations.init().then(() => {
          if (this.lazyStart) {
            this.log(`The client [${this.clientName}] will start lazily when 'start' topic message arrives.`);
          } else {
            this.operations.startClient();
          }
        });
      }
      this.on('close', (done) => {
        delete lwm2mClients[key];
        this.operations.shutdown().then(() => {
          done();
        }).catch((err) => {
          this.log(err);
          done();
        });
      });
    }
  }
  RED.nodes.registerType('lwm2m client', LwM2MClientNode, {
    credentials: {
      pskIdentity: {type: 'text'},
      presharedKey: {type: 'text'},
    }
  });

  class LwM2MClientInNode {
    constructor(n) {
      RED.nodes.createNode(this, n);
      this.lwm2mClientNodeId = n.lwm2mClient;
      this.lwm2mClientNode = RED.nodes.getNode(this.lwm2mClientNodeId);
      this.subscribeObjectEvents = !!n.subscribeObjectEvents;
      this.outputAsObject = !!n.outputAsObject;
      if (this.lwm2mClientNode) {
        if (this.subscribeObjectEvents) {
          let clientName = this.lwm2mClientNode.clientName;
          this.lwm2mClientNode.setMaxListeners(this.lwm2mClientNode.getMaxListeners() + 1);
          this.lwm2mClientNode.on('object-event', (ev) => {
            this.trace(`[LwM2MClientIn] <${clientName}> ${JSON.stringify(ev)}`);
            this.send({
              payload: ev
            });
          });
        }
        GREEN_EVENTS.forEach(ev => {
          this.on(ev, () => {
            let label = `lwm2m.status.${ev}`;
            if (ev === 'connected' && this.subscribeObjectEvents) {
              label = `lwm2m.status.subscribed`;
            }
            this.status({fill:'green',shape:'dot',text: label});
          });
        });
        BLUE_EVENTS.forEach(ev => {
          this.on(ev, () => {
            this.status({fill:'blue',shape:'dot',text:`lwm2m.status.${ev}`});
          });
        });
        RED_EVENTS.forEach(ev => {
          this.on(ev, () => {
            this.status({fill:'red',shape:'ring',text:`lwm2m.status.${ev}`});
          });
        });
        this.lwm2mClientNode.operations.register(this);
        this.on('input', (msg) => {
          if (msg && msg.topic) {
            const control = msg.topic.toLowerCase();
            switch (control) {
              case 'start': {
                if (this.lwm2mClientNode.lazyStart) {
                  return this.lwm2mClientNode.operations.startClient();
                }
                return; // ignore
              }
              case 'stop': {
                return this.lwm2mClientNode.operations.stopClient();
              }
              case 'deregister': {
                return this.lwm2mClientNode.operations.deregisterClient();
              }
            }
          }
          if (msg && Buffer.isBuffer(msg.payload)) {
            this.trace(`[LwM2MClientIn] input arrived! msg=> Buffer(length=${msg.payload.length})`);
          } else {
            this.trace(`[LwM2MClientIn] input arrived! msg=> ${JSON.stringify(msg)}`);
          }
          if (this.lwm2mClientNode && this.lwm2mClientNode.objectStore) {
            const output = {
              topic: msg.topic
            };
            const outputAsObject = typeof msg.outputAsObject === 'undefined' ? this.outputAsObject : !!msg.outputAsObject;
            this.lwm2mClientNode.objectStore.get(msg.topic).then((result) => {
              output.payload = result;
              if (outputAsObject) {
                output.payload = result.reduce((acc, curr) => {
                  acc[curr.uri] = curr.value;
                  return acc;
                }, {});
              }
              this.send(output);
            }).catch((err) => {
              output.payload = err;
              this.error(`lwm2m error`, output);
            });
          }
        });
        this.on('close', () => {
          if (this.lwm2mClientNode) {
            this.lwm2mClientNode.operations.remove(this);
          }
          this.status({});
        });
      }
      this.name = n.name;
    }
  }
  RED.nodes.registerType('lwm2m client in', LwM2MClientInNode);

  class LwM2MClientOutNode {
    constructor(n) {
      RED.nodes.createNode(this, n);
      this.lwm2mClientNodeId = n.lwm2mClient;
      this.lwm2mClientNode = RED.nodes.getNode(this.lwm2mClientNodeId);

      if (this.lwm2mClientNode) {
        GREEN_EVENTS.forEach(ev => {
          this.on(ev, () => {
            this.status({fill:'green',shape:'dot',text:`lwm2m.status.${ev}`});
          });
        });
        BLUE_EVENTS.forEach(ev => {
          this.on(ev, () => {
            this.status({fill:'blue',shape:'dot',text:`lwm2m.status.${ev}`});
          });
        });
        RED_EVENTS.forEach(ev => {
          this.on(ev, () => {
            this.status({fill:'red',shape:'ring',text:`lwm2m.status.${ev}`});
          });
        });
        this.lwm2mClientNode.operations.register(this);
        this.on('input', (msg) => {
          if (this.lwm2mClientNode) {
            let p;
            let topic = msg.topic || '';
            let execute = topic.indexOf('/execute');
            if (execute >= 0 && execute === topic.length - 8) {
              p = this.lwm2mClientNode.objectStore.execute(
                msg.topic.substring(0, execute),
                msg.payload, false);
            } else {
              p = this.lwm2mClientNode.objectStore.write(
                msg.topic, msg.payload, false);
            }
            p.catch((err) => {
              this.error(`lwm2m error`, { topic, payload: err });
            });
          }
        });
        this.on('close', () => {
          if (this.lwm2mClientNode) {
            this.lwm2mClientNode.operations.remove(this);
          }
          this.status({});
        });
      }
      this.name = n.name;
    }
  }
  RED.nodes.registerType('lwm2m client out', LwM2MClientOutNode);
}
