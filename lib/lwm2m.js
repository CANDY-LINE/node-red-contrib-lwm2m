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

'use strict';

import 'source-map-support/register';
import {
  ResourceRepositoryBuilder, LwM2MClientProxy, LwM2MObjectStore
} from './lwm2m-common';

const TRACE = (process.env.LWM2M_TRACE === 'true');

const GREEN_EVENTS = ['connected'];
const BLUE_EVENTS = ['bootstrapRequired', 'bootstrapping', 'registerRequired', 'registering'];
const RED_EVENTS = ['disconnected', 'error', 'timeout'];
const ALL_EVENTS = GREEN_EVENTS.concat(BLUE_EVENTS).concat(RED_EVENTS);

export default function(RED) {

  let lwm2mClients = {};
  function createKey(host, port) {
    return host + ':' + port;
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

  class LwM2MClientNode {
    constructor(n) {
      RED.nodes.createNode(this, n);
      this.clientName = n.clientName;
      this.enableDTLS = !!n.enableDTLS;
      this.clientPort = parseInt(n.clientPort) || 56830;
      this.lifetimeSec = parseInt(n.lifetimeSec) || 300;
      this.requestBootstrap = !!n.requestBootstrap;
      this.useIPv4 = !!n.useIPv4;
      this.redirectLwm2mClientLog = !!n.redirectLwm2mClientLog;
      this.hideSensitiveInfo = !!n.hideSensitiveInfo;
      this.pskIdentity = (this.credentials || {}).pskIdentity || '';
      this.presharedKey = (this.credentials || {}).presharedKey || '';
      this.serverId = parseInt(n.serverId) || 99;
      this.serverHost = n.serverHost;
      this.serverPort = parseInt(n.serverPort) || (this.enableDTLS ? 5684 : 5683);
      this.objects = n.objects || '';
      let key = createKey(this.serverHost, this.serverPort);
      if (lwm2mClients[key]) {
        throw new Error(RED._('lwm2m.error.duplicateEntry', { host: this.serverHost, port: this.serverPort }));
      }
      lwm2mClients[key] = this;
      this.nodes = {};
      let self = this;
      this.objectStore = new LwM2MObjectStore(this);
      this.client = new LwM2MClientProxy(this, this.objectStore);
      this.operations = {
        init() {
          let json = (RED.settings.lwm2m || {}).objects || {};
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
          return new ResourceRepositoryBuilder(
            [json, initialObjects]).build(self.hideSensitiveInfo).then((repo) => {
            self.objectStore.repo = repo;
          }).catch((err) => {
            if (err instanceof Error) {
              self.log(err);
            }
            self.error(`lwm2m error`, { payload: err });
          });
        },
        startClient() {
          self.client.start();
        },
        register(node) {
          if (node) {
            if (self.nodes[node.id]) {
              return false;
            }
            self.nodes[node.id] = node;
            if (self.client.isConnected()) {
              self.emit('connected');
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
          return self.client.shutdown();
        }
      };
      ALL_EVENTS.forEach(ev => {
        this.client.on(ev, () => {
          try {
            Object.keys(this.nodes).forEach(id => {
              this.nodes[id].emit(ev);
            });
          } catch (e) {
            this.warn(e);
          }
        });
      });
      this.operations.init().then(() => {
        this.operations.startClient();
      });
      this.on('close', (done) => {
        this.client.shutdown().then(() => {
          delete lwm2mClients[key];
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
      if (this.lwm2mClientNode) {
        let clientName = this.lwm2mClientNode.clientName;
        this.lwm2mClientNode.on('object-event', (ev) => {
          if (TRACE) {
            this.log(`[LwM2MClientOut] <${clientName}> ${JSON.stringify(ev)}`);
          }
          this.send({
            payload: ev
          });
        });
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
          if (TRACE) {
            this.log(`[LwM2MClientIn] input arrived! msg=> ${JSON.stringify(msg)}`);
          }
          if (this.lwm2mClientNode) {
            this.lwm2mClientNode.objectStore.get(msg.topic).then((result) => {
              this.send({
                payload: result
              });
            }).catch((err) => {
              this.error(`lwm2m error`, { payload: err });
            });
          }
        });
        this.on('close', () => {
          if (this.lwm2mClientNode) {
            this.lwm2mClientNode.operations.remove(this);
          }
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
              this.error(`lwm2m error`, { payload: err });
            });
          }
        });
        this.on('close', () => {
          if (this.lwm2mClientNode) {
            this.lwm2mClientNode.operations.remove(this);
          }
        });
      }
      this.name = n.name;
    }
  }
  RED.nodes.registerType('lwm2m client out', LwM2MClientOutNode);
}
