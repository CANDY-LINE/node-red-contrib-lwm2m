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
import fs from 'fs';
import path from 'path';
import {
  ResourceRepositoryBuilder, LwM2MClientProxy
} from './lwm2m-common';

const TRACE = (process.env.LWM2M_TRACE === 'true');

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
      this.pskIdentity = (this.credentials || {}).pskIdentity || '';
      this.presharedKey = (this.credentials || {}).presharedKey || '';
      this.serverHost = n.serverHost;
      this.serverPort = parseInt(n.serverPort) || (this.enableDTLS ? 5684 : 5683);
      let key = createKey(this.serverHost, this.serverPort);
      if (lwm2mClients[key]) {
        throw new Error(RED._('lwm2m.error.duplicateEntry', { host: this.serverHost, port: this.serverPort }));
      }
      lwm2mClients[key] = this;
      this.nodes = {};
      this.client = new LwM2MClientProxy(this);
      let self = this;
      this.objectStore = {
        repoFileName: `lwm2m_${self.clientName}_${self.serverHost}_${self.serverPort}.json`,
        repo: null,
        localWrite(uri, value) {
          if (uri) {
            self.objectStore.repo[uri] = value;
            // TODO notify update to lwm2mclient
            return Promise.resolve();
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uri })));
        },
        localExecute(uri) {
          if (uri) {
            self.emit('object-event', {
              uri: uri,
              eventType: 'executed',
              remote: false
            });
            return Promise.resolve();
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uri })));
        },
        localGet(uriRegEx) {
          if (uriRegEx) {
            // TODO
            let result = {};
            Object.keys(self.objectStore.repo).map((uri) => {
              if (uri.match(uriRegEx)) {
                result[uri] = self.objectStore.repo[uri];
              }
            });
            return Promise.resolve(result);
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uriRegEx })));
        },
        localCreate(uri, value) {
          if (uri) {
            self.objectStore.repo[uri] = value;
            // TODO notify update to lwm2mclient
            return Promise.resolve();
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uri })));
        },
        localDelete(uriRegEx) {
          if (uriRegEx) {
            let keysToRemove = Object.keys(self.objectStore.repo).map((uri) => {
              if (uri.match(uriRegEx)) {
                return uri;
              }
            }).filter(uri => uri);
            keysToRemove.forEach((uri) => {
              delete self.objectStore.repo[uri];
            });
            // TODO notify update to lwm2mclient
            return Promise.resolve();
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uriRegEx })));
        },
        remoteWrite(uri, value) {
          if (uri) {
            self.objectStore.localWrite(uri, value);
            self.emit('object-event', {
              uri: uri,
              value: value,
              eventType: 'updated',
              remote: true
            });
            return Promise.resolve();
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uri })));
        },
        remoteExecute(uri) {
          if (uri) {
            self.emit('object-event', {
              uri: uri,
              eventType: 'executed',
              remote: true
            });
            return Promise.resolve();
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uri })));
        },
        remoteGet(uris) {
          let result = {};
          if (uris && uris.length > 0) {
            Object.keys(self.objectStore.repo).map((uri) => {
              if (uris.indexOf(uri) >= 0) {
                result[uri] = self.objectStore.repo[uri];
              }
            });
          } else {
            // copy all
            Object.assign(result, self.objectStore.repo);
          }
          return Promise.resolve(result);
        },
        remoteCreate(uri, value) {
          if (uri) {
            self.emit('object-event', {
              uri: uri,
              value: value,
              eventType: 'created',
              remote: true
            });
            return Promise.resolve();
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uri })));
        },
        remoteDelete(uri) {
          if (uri) {
            self.objectStore.localDelete(uri);
            self.emit('object-event', {
              uri: uri,
              eventType: 'deleted',
              remote: true
            });
            return Promise.resolve();
          }
          return Promise.reject(new Error(RED._('lwm2m.error.missingUri', { uri: uri })));
        }
      };
      this.operations = {
        init() {
          if (self.objectStore.repo) {
            return Promise.resolve();
          }
          return new Promise((resolve) => {
            fs.readFile(path.join(RED.settings.userDir,
                self.objectStore.repoFileName), (err, data) => {
              self.objectStore.repo = {};
              if (err) {
                self.objectStore.repo = new ResourceRepositoryBuilder().build();
              } else {
                try {
                  self.objectStore.repo = new ResourceRepositoryBuilder(JSON.parse(data)).build();
                } catch (_) {
                }
              }
              resolve();
            });
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
          self.client.shutdown();
        }
      };
      ['connected', 'disconnected', 'error', 'timeout'].forEach(ev => {
        this.on(ev, () => {
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
        if (this.cproc) {
          this.cproc.kill('SIGINT');
        }
        delete lwm2mClients[key];
        fs.writeFile(path.join(RED.settings.userDir,
            this.objectStore.repoFileName),
            this.objectStore.repo.toJSONString(), (err) => {
          this.log(`Repository data has been saved to ${this.objectStore.repoFileName}`);
          return done(err);
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
        this.on('connected', () => {
          this.status({fill:'green',shape:'dot',text:`lwm2m.status.connected`});
        });
        ['disconnected', 'error', 'timeout'].forEach(ev => {
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
            this.lwm2mClientNode.objectStore.localGet(msg.topic).then((result) => {
              this.send({
                payload: result
              });
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
        this.on('connected', () => {
          this.status({fill:'green',shape:'dot',text:`lwm2m.status.connected`});
        });
        ['disconnected', 'error', 'timeout'].forEach(ev => {
          this.on(ev, () => {
            this.status({fill:'red',shape:'ring',text:`lwm2m.status.${ev}`});
          });
        });
        this.lwm2mClientNode.operations.register(this);
        this.on('input', (msg) => {
          if (this.lwm2mClientNode) {
            this.lwm2mClientNode.operations.write(msg.payload);
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
