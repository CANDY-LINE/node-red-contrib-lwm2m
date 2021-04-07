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
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  Resource, LwM2MClientProxy, LwM2MObjectStore,
  RequestHandler, ResourceRepositoryBuilder
} from './lwm2m-common';
import {
  COAP_ERROR,
  LWM2M_OBJECT_ID,
  LWM2M_TYPE,
  ACL,
} from './object-common';

chai.should();
chai.use(sinonChai);
const expect = chai.expect;
const HEADER_LEN = 5;

describe('LwM2MObjectStore', () => {
  let sandbox;
  let opts;
  let store;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    opts = new EventEmitter();
  });
  afterEach(() => {
    sandbox.restore();
    if (store) {
      return store.shutdown();
    }
  });

  describe('#constructor', () => {
    it('should initialize props', () => {
      opts.serverId = 1234;
      store = new LwM2MObjectStore(opts);
      expect(store.repo).to.be.null;
      expect(store.serverId).to.equal(1234);
    });
  });

  describe('#emit', () => {
    it('should emit a remote event to user app', (done) => {
      opts.serverId = 1234;
      store = new LwM2MObjectStore(opts);
      opts.on('object-event', (ev) => {
        expect(ev.serverId).to.equal(opts.serverId);
        expect(ev.uri).to.equal('uri');
        expect(ev.value).to.equal('value');
        expect(ev.eventType).to.equal('eventType');
        done();
      });
      store.emit('uri', 'value', 'eventType', true);
    });

    it('should emit a local event to user app', (done) => {
      opts.serverId = 1234;
      store = new LwM2MObjectStore(opts);
      opts.on('object-event', (ev) => {
        expect(ev.serverId).to.be.undefined;
        expect(ev.uri).to.equal('uri');
        expect(ev.value).to.equal('value');
        expect(ev.eventType).to.equal('eventType');
        done();
      });
      store.emit('uri', 'value', 'eventType', false);
    });
  });

  describe('#createCredentials', () => {
    it('should return a query result', (done) => {
      store = new LwM2MObjectStore(opts);
      new ResourceRepositoryBuilder([], true).build({
        hideSensitiveInfo: false,
        serverHost: 'localhost',
        serverPort: 5683,
      }).then((repo) => {
        store.repo = repo;
        return store.createCredentials();
      }).then((credentials) => {
        expect(credentials).to.be.an('object');
        expect(Object.keys(credentials).length).to.equal(3);
        expect(credentials[0]).to.be.an('object');
        expect(credentials[0][0]).to.be.an('object');
        expect(credentials[0][0][0]).to.be.an('object');
        expect(credentials[0][0][0].type).to.equal('STRING');
        expect(credentials[0][0][0].acl).to.equal('RW');
        expect(credentials[0][0][0].value).to.equal('coap://localhost:5683');
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });

  });

  describe('#get', () => {
    it('should return a query result', (done) => {
      store = new LwM2MObjectStore(opts);
      new ResourceRepositoryBuilder([
        {
          '1': {
            '2': {
              '3': {
                type: 'STRING',
                value: 'test0',
              },
            },
          },
          '3': {
            '0': {
              '0': {
                type: 'STRING',
                acl: 'RW',
                value: 'test',
              },
              '1': {
                type: 'STRING',
                value: 'test2',
              },
              '2': {
                type: 'STRING',
                value: 'test3',
              },
              '22': {
                type: 'MULTIPLE_RESOURCE',
                value: {
                  '90': 'ABC',
                  '99': 'XYZ',
                },
              },
            },
          },
        }
      ], false).build({
        hideSensitiveInfo: false
      }).then((repo) => {
        store.repo = repo;
        return store.get('^/3/.*').then((result) => {
          expect(result).to.be.an('array');
          expect(result.length).to.equal(4);
          expect(result[0].uri).to.equal('/3/0/0');
          expect(result[0].value.type).to.equal('STRING');
          expect(result[0].value.acl).to.equal('RW');
          expect(result[0].value.value).to.equal('test');
          expect(result[1].uri).to.equal('/3/0/1');
          expect(result[1].value.type).to.equal('STRING');
          expect(result[1].value.value).to.equal('test2');
          expect(result[2].uri).to.equal('/3/0/2');
          expect(result[2].value.type).to.equal('STRING');
          expect(result[2].value.value).to.equal('test3');
          expect(result[3].uri).to.equal('/3/0/22');
          expect(result[3].value.type).to.equal('MULTIPLE_RESOURCE');
          expect(result[3].value.value).to.deep.equal({
            '90': {
              type: 'STRING',
              acl: 'RWD',
              value: 'ABC'
            },
            '99': {
              type: 'STRING',
              acl: 'RWD',
              value: 'XYZ'
            },
          });
          done();
        }).catch((err) => {
          done(err);
        });
      });
    });
    it('should not include similar uri results', (done) => {
      store = new LwM2MObjectStore(opts);
      new ResourceRepositoryBuilder([
        {
          '1': {
            '2': {
              '3': {
                type: 'STRING',
                value: 'test0',
              },
            },
          },
          '3': {
            '0': {
              '0': {
                type: 'STRING',
                value: 'test',
              },
              '1': {
                type: 'STRING',
                value: 'test2',
              },
              '2': {
                type: 'STRING',
                value: 'test3',
              },
              '22': {
                type: 'MULTIPLE_RESOURCE',
                value: {
                  '90': 'ABC',
                  '99': 'XYZ',
                },
              },
            },
          },
        }
      ], false).build({
        hideSensitiveInfo: false
      }).then((repo) => {
        store.repo = repo;
        return store.get('^/3/0/2$').then((result) => {
          expect(result).to.be.an('array');
          expect(result.length).to.equal(1);
          expect(result[0].uri).to.equal('/3/0/2');
          expect(result[0].value.type).to.equal('STRING');
          expect(result[0].value.value).to.equal('test3');
          return store.get('/0/2');
        }).then(() => {
          done('Should be missing');
        }).catch((err) => {
          expect(err.status).to.equal(COAP_ERROR.COAP_404_NOT_FOUND);
          done();
        });
      });
    });
  });

  describe('#backup', () => {
    it('should backup a specifid object', (done) => {
      store = new LwM2MObjectStore(opts);
      new ResourceRepositoryBuilder().build({
        requestBootstrap: true,
        serverHost: 'localhost',
        serverPort: 5783,
        enableDTLS: false, // security none
        serverId: 123,
        lifetimeSec: 500,
      }).then((repo) => {
        store.repo = repo;
        return store.backup(LWM2M_OBJECT_ID.SECURITY);
      }).then(() => {
        const result = store.backupObjects[LWM2M_OBJECT_ID.SECURITY];
        expect(result).to.be.an('object');
        expect(result.repo).to.be.an('array');
        expect(result.repo.length).to.equal(13);
        expect(result.repo.filter(x => x.uri === '/0/0/10')[0].value.value).to.equal(123);
        return store.write('/0/0/10', 999);
      }).then(() => {
        const result = store.backupObjects[LWM2M_OBJECT_ID.SECURITY];
        // assert the backup isn't affected
        expect(result.repo.filter(x => x.uri === '/0/0/10')[0].value.value).to.equal(123);
        done();
      }).catch((err) => {
        done(err);
      });
    });
    // #backup
  });

  describe('#restore', () => {
    it('should restore a specifid object', (done) => {
      store = new LwM2MObjectStore(opts);
      new ResourceRepositoryBuilder().build({
        requestBootstrap: true,
        serverHost: 'localhost',
        serverPort: 5783,
        enableDTLS: false, // security none
        serverId: 123,
        lifetimeSec: 500,
      }).then((repo) => {
        store.repo = repo;
        return store.backup(LWM2M_OBJECT_ID.SECURITY);
      }).then(() => {
        const result = store.backupObjects[LWM2M_OBJECT_ID.SECURITY];
        expect(result.repo.filter(x => x.uri === '/0/0/10')[0].value.value).to.equal(123);
        return store.write('/0/0/10', 999);
      }).then(() => {
        const result = store.backupObjects[LWM2M_OBJECT_ID.SECURITY];
        // assert the backup isn't affected
        expect(result.repo.filter(x => x.uri === '/0/0/10')[0].value.value).to.equal(123);
        return store.get('/0/0/10');
      }).then((result) => {
        expect(result[0].value.value).to.equal(999);
        return store.restore(LWM2M_OBJECT_ID.SECURITY);
      }).then(() => {
        return store.get('/0/0/10');
      }).then((result) => {
        expect(result[0].value.value).to.equal(123);
        done();
      }).catch((err) => {
        done(err);
      });
    });
    // #restore
  });

  describe('#create', () => {
    it('should create a new instance having defined types and ACLs', (done) => {
      store = new LwM2MObjectStore(opts);
      new ResourceRepositoryBuilder().build({
        requestBootstrap: true,
        serverHost: 'localhost',
        serverPort: 5783,
        enableDTLS: false, // security none
        serverId: 123,
        lifetimeSec: 500,
      }).then((repo) => {
        store.repo = repo;
        return store.delete('/0/.*').then(() => store.get('/0/.*')).then(() => {
          throw 'SECURITY object was NOT removed';
        }).catch(err => {
          expect(err.status).to.equal(COAP_ERROR.COAP_404_NOT_FOUND);
        });
      }).then(() => {
        return store.create('/0/0/0', {
          type: LWM2M_TYPE.OPAQUE,
          value: Buffer.from('my-data')
        }).then(() => store.get('/0/.*'));
      }).then((result) => {
        expect(result.length).to.equal(1);
        expect(result[0].uri).to.equal('/0/0/0');
        expect(result[0].value.type).to.equal('STRING');
        expect(result[0].value.acl).to.equal('RW');
        expect(result[0].value.value).to.equal('my-data');
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    // #create
  });

  describe('#write', () => {
    it('should create a new instance when the destination entry is missing', (done) => {
      store = new LwM2MObjectStore(opts);
      new ResourceRepositoryBuilder().build({
        requestBootstrap: true,
        serverHost: 'localhost',
        serverPort: 5783,
        enableDTLS: false, // security none
        serverId: 123,
        lifetimeSec: 500,
      }).then((repo) => {
        store.repo = repo;
        return store.delete('/0/.*').then(() => store.get('/0/.*')).then(() => {
          throw 'SECURITY object was NOT removed';
        }).catch(err => {
          expect(err.status).to.equal(COAP_ERROR.COAP_404_NOT_FOUND);
        });
      }).then(() => {
        return store.write('/0/0/0', {
          type: LWM2M_TYPE.OPAQUE,
          value: Buffer.from('my-data')
        }).then(() => store.get('/0/.*', [], true));
      }).then((result) => {
        expect(result.length).to.equal(1);
        expect(result[0].uri).to.equal('/0/0/0');
        expect(result[0].value.type).to.equal(LWM2M_TYPE.STRING);
        expect(result[0].value.acl).to.equal(ACL.READWRITE);
        expect(result[0].value.value).to.equal('my-data');
        expect(result[0].value.isDeletable()).to.equal(false);
        return store.write('/900/0/0', {
          type: LWM2M_TYPE.MULTIPLE_RESOURCE,
          acl: ACL.READWRITE,
          value: ['abcdef']
        }).then(() => store.get('/900/.*', [], true));
      }).then((result) => {
        expect(result.length).to.equal(1);
        expect(result[0].uri).to.equal('/900/0/0');
        expect(result[0].value.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(result[0].value.acl).to.equal(ACL.READWRITE);
        expect(result[0].value.value[0].value).to.equal('abcdef');
        expect(result[0].value.isDeletable()).to.equal(false);
        return store.write('/901/0/0', {
          type: LWM2M_TYPE.MULTIPLE_RESOURCE,
          acl: ACL.READWRITE,
          value: {
            '0': 'abcdef'
          }
        }).then(() => store.get('/901/.*', [], true));
      }).then((result) => {
        expect(result.length).to.equal(1);
        expect(result[0].uri).to.equal('/901/0/0');
        expect(result[0].value.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(result[0].value.acl).to.equal(ACL.READWRITE);
        expect(result[0].value.value[0].value).to.equal('abcdef');
        expect(result[0].value.isDeletable()).to.equal(false);
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    // #write
  });
  // end of 'LwM2MObjectStore'
});

describe('ResourceRepositoryBuilder', () => {
  let sandbox;
  let client;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    client = sandbox.stub(new LwM2MClientProxy());
  });
  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor', () => {
    it('should have valid query URI resources', () => {
      let b = new ResourceRepositoryBuilder([
        // settings.js, always preserved
        {
          version: '1.2.3',
          '0': {
            '0': {
              '0': 'string', // /0/0/0
              '3': 1234
            }
          }, // '0'
          '1': {
            '1': {
              '3': 'saved /1/1/3',
              '4': 'saved /1/1/4',
            },
            '2': {
              '2': 'saved /1/2/2',
            },
          }, // '1'
        },
        // user's custom overlay objects
        {
          '0': {
            '0': {
              '1': 'custom /0/0/1',
              '2': 'custom /0/0/2',
              '3': 'custom /0/0/3',
            }
          }, // '0'
          '1': {
            '0': {
              '1': 'custom /1/0/1',
              '2': 'custom /1/0/2',
            },
            '1': {
              '3': 'custom /1/1/3',
            }
          }, // '1'
        },
        // system default opjects (can be overwritten by user's overlay objects)
        {
          '0': {
            '0': {
              '0': 'default /0/0/0',
              '1': 'default /0/0/1',
              '2': 'default /0/0/2',
              '3': 'default /0/0/3',
            }
          }, // '0'
          '1': {
            '0': {
              '0': 'default /1/0/0',
              '1': 'default /1/0/1',
              '2': 'default /1/0/2',
              '3': 'default /1/0/3'
            },
            '1': {
              '0': 'default /1/1/0',
              '1': 'default /1/1/1',
              '2': 'default /1/1/2',
              '3': 'default /1/1/3',
              '4': 'default /1/1/4',
            },
          }, // '1'
        },
      ], false);
      expect(b.json).to.deep.equal(
        {
          '0': {
            '0': {
              '0': 'string', // /0/0/0
              '1': 'custom /0/0/1',
              '2': 'custom /0/0/2',
              '3': 1234,
            }
          }, // '0'
          '1': {
            '0': {
              '0': 'default /1/0/0',
              '1': 'custom /1/0/1',
              '2': 'custom /1/0/2',
              '3': 'default /1/0/3',
            },
            '1': {
              '0': 'default /1/1/0',
              '1': 'default /1/1/1',
              '2': 'default /1/1/2',
              '3': 'saved /1/1/3',
              '4': 'saved /1/1/4',
            },
            '2': {
              '2': 'saved /1/2/2',
            }
          }, // '1'
        }
      );
    });
  });

  describe('#build', () => {
    it('should apply security and server information to built repo object with None security mode', (done) => {
      let repo;
      new ResourceRepositoryBuilder().build({
        serverHost: 'localhost',
        serverPort: 5683,
        enableDTLS: false, // security none
        serverId: 123,
        lifetimeSec: 500,
      }).then((r) => {
        repo = r;
        expect(repo['/0/0/0'].value).to.equal('coap://localhost:5683');
        expect(repo['/0/0/1'].value).to.equal(false);
        expect(repo['/0/0/2'].value).to.equal(3); // NONE
        expect(repo['/0/0/3'].toString()).to.equal('');
        expect(repo['/0/0/5'].toString()).to.equal('');
        expect(repo['/0/0/10'].value).to.equal(123);

        expect(repo['/1/0/0'].value).to.equal(123);
        expect(repo['/1/0/1'].value).to.equal(500);

        expect(repo['/2/0/2'].value[0]).to.be.undefined;
        expect(repo['/2/0/2'].value[123].toInteger()).to.equal(ACL.ALL);
        expect(repo['/2/0/3'].value).to.equal(123);

        expect(repo.definitions['0']['0'].type).to.equal(LWM2M_TYPE.STRING);
        expect(repo.definitions['3']['0'].acl).to.equal(ACL.READABLE);

      }).then(() => {
        ResourceRepositoryBuilder.destroy(repo);
        done();
      }).catch((err) => {
        ResourceRepositoryBuilder.destroy(repo);
        done(err);
      });
    });

    it('should apply security and server information to built repo object with PSK security mode', (done) => {
      let repo;
      new ResourceRepositoryBuilder().build({
        serverHost: 'localhost',
        serverPort: 5684,
        enableDTLS: true, // security none
        pskIdentity: 'my-psk-identity-is-here',
        presharedKey: '00112233ff',
        serverId: 987,
        lifetimeSec: 500,
      }).then((r) => {
        repo = r;
        expect(repo['/0/0/0'].value).to.equal('coaps://localhost:5684');
        expect(repo['/0/0/1'].value).to.equal(false);
        expect(repo['/0/0/2'].value).to.equal(0); // PSK
        expect(repo['/0/0/3'].toString()).to.equal('my-psk-identity-is-here');
        expect(repo['/0/0/5'].toBuffer().toString('hex')).to.equal('00112233ff');
        expect(repo['/0/0/10'].value).to.equal(987);

        // the server object won't be tested as it is removed on bootstrapping

        expect(repo['/2/0/2'].value[0]).to.be.undefined;
        expect(repo['/2/0/2'].value[987].toInteger()).to.equal(ACL.ALL);
        expect(repo['/2/0/3'].value).to.equal(987);

      }).then(() => {
        ResourceRepositoryBuilder.destroy(repo);
        done();
      }).catch((err) => {
        ResourceRepositoryBuilder.destroy(repo);
        done(err);
      });
    });

    it('should apply security and server information to built repo object with Bootstrap and None security mode', (done) => {
      let repo;
      new ResourceRepositoryBuilder().build({
        requestBootstrap: true,
        serverHost: 'localhost',
        serverPort: 5783,
        enableDTLS: false, // security none
        serverId: 123,
        lifetimeSec: 500,
      }).then((r) => {
        repo = r;
        expect(repo['/0/0/0'].value).to.equal('coap://localhost:5783');
        expect(repo['/0/0/1'].value).to.equal(true);
        expect(repo['/0/0/2'].value).to.equal(3); // NONE
        expect(repo['/0/0/3'].toString()).to.equal('');
        expect(repo['/0/0/5'].toString()).to.equal('');
        expect(repo['/0/0/10'].value).to.equal(123);

        expect(repo['/1/0/0'].value).to.equal(123);
        expect(repo['/1/0/1'].value).to.equal(500);

        expect(repo['/2/0/2'].value[0]).to.be.undefined;
        expect(repo['/2/0/2'].value[123].toInteger()).to.equal(ACL.ALL);
        expect(repo['/2/0/3'].value).to.equal(123);

      }).then(() => {
        ResourceRepositoryBuilder.destroy(repo);
        done();
      }).catch((err) => {
        ResourceRepositoryBuilder.destroy(repo);
        done(err);
      });
    });

    it('should apply security and server information to built repo object with Bootstrap and PSK security mode', (done) => {
      let repo;
      new ResourceRepositoryBuilder().build({
        requestBootstrap: true,
        serverHost: 'localhost',
        serverPort: 5784,
        enableDTLS: true, // security none
        pskIdentity: 'my-psk-identity-is-here',
        presharedKey: '00112233ff',
        serverId: 987,
        lifetimeSec: 500,
      }).then((r) => {
        repo = r;
        expect(repo['/0/0/0'].value).to.equal('coaps://localhost:5784');
        expect(repo['/0/0/1'].value).to.equal(true);
        expect(repo['/0/0/2'].value).to.equal(0); // PSK
        expect(repo['/0/0/3'].toString()).to.equal('my-psk-identity-is-here');
        expect(repo['/0/0/5'].toBuffer().toString('hex')).to.equal('00112233ff');
        expect(repo['/0/0/10'].value).to.equal(987);

        // the server object won't be tested as it is removed on bootstrapping

        expect(repo['/2/0/2'].value[0]).to.be.undefined;
        expect(repo['/2/0/2'].value[987].toInteger()).to.equal(ACL.ALL);
        expect(repo['/2/0/3'].value).to.equal(987);

        expect(repo['/3/0/9'].toValue()).to.be.a('number');
        expect(repo['/3/0/10'].toValue()).to.be.a('number');

      }).then(() => {
        ResourceRepositoryBuilder.destroy(repo);
        done();
      }).catch((err) => {
        ResourceRepositoryBuilder.destroy(repo);
        done(err);
      });
    });

  });
  // end of 'ResourceRepositoryBuilder'
});

describe('RequestHandler', () => {
  let sandbox;
  let client;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    client = sandbox.stub(new LwM2MClientProxy());
  });
  afterEach(() => {
    sandbox.restore();
  });

  describe('Read', () => {
    describe('#constructor', () => {
      it('should have valid query URI resources', () => {
        let r;
        r = RequestHandler.build(client, 'read', Buffer.from('AQECAAAAAQAAAA==', 'base64'));
        expect(r.uris).to.deep.equal(['^/2/0/0$']);
        expect(r.resourceLen).to.equal(1);
        r = RequestHandler.build(client, 'read', Buffer.from('AQECAAAAAAA=', 'base64'));
        expect(r.resourceLen).to.equal(0);
        expect(r.uris).to.deep.equal(['^/2/0/[0-9]+$']);
      });
    });
    // end of Read
  });

  describe('ReadInstances', () => {
    describe('#resolveInstanceIdList', () => {
      it('should create a list of instance IDs', () => {
        const cmd = RequestHandler.build(client, 'readInstances', Buffer.from([]));
        const resources = [
          {
            uri: '/3303/0/5700',
            value: {
              type: 'FLOAT',
              acl: 'R',
              value: 0
            }
          },
          {
            uri: '/3303/1/5700',
            value: {
              type: 'FLOAT',
              acl: 'R',
              value: 0
            }
          }
        ];
        expect(cmd.resolveInstanceIdList(resources)).to.deep.equal([
          0, 1
        ]);
      });
    });
    // end of Read
  });
  // end of 'RequestHandler'
});

describe('Resource', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });
  afterEach(() => {
    sandbox.restore();
  });

  describe('#clone()', () => {
    it('should clone a copy of the given resource object', (done) => {
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: 'xyz'
      }).then((r) => {
        const copy = r.clone();
        copy.value = '';
        expect(r.value).to.equal('xyz');
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
  });

  describe('#serialize()', () => {
    it('should serialize a Resource', (done) => {
      Resource.from('string').then((r) => {
        try {
          r.serialize();
          throw new Error('should throw an error');
        } catch (_) {
          // OK
        }
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('string');

        return Resource.from('');
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('');

        return Resource.from(0);
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('0');

        return Resource.from(0.1);
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('0.1');

        return Resource.from({type:LWM2M_TYPE.FLOAT});
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('');

        return Resource.from({type:LWM2M_TYPE.INTEGER});
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('');

        return Resource.from({type:LWM2M_TYPE.BOOLEAN});
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('');

        return Resource.from({type:LWM2M_TYPE.BOOLEAN, value: true});
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length)[0]).to.equal(1);

        return Resource.from({type:LWM2M_TYPE.OPAQUE, value:Buffer.from([1,2,3])});
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length)).to.deep.equal(Buffer.from([1,2,3]));

        return Resource.from({type:LWM2M_TYPE.OPAQUE, value:[1,2,3]});
      }).then((r) => {
        r.id = 0;
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length)).to.deep.equal(Buffer.from([1,2,3]));

        return Resource.from({type:LWM2M_TYPE.OPAQUE});
      }).then((r) => {
        let buf;

        r.id = 0;
        r.value = 'base64:AQID';
        buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length)).to.deep.equal(Buffer.from([1,2,3]));

        r.value = 'hex:010203';
        buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length)).to.deep.equal(Buffer.from([1,2,3]));
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
  });

  describe('#parse()', () => {
    it('should parse a multiple Resource', () => {
      let resources = {};
      Resource.parse(resources, Buffer.from([
        0x00, // ResourceId LSB
        0x00, // ResourceId MSB
        LWM2M_TYPE.MULTIPLE_RESOURCE, // Resouce Data Type
        0x10, // Length of resource data LSB
        0x00, // Length of resource data MSB
        // Multiple Resource Entry 1
        0x05, // ResourceId LSB
        0x00, // ResourceId MSB
        LWM2M_TYPE.STRING,
        0x03, // Length of resource data LSB
        0x00, // Length of resource data MSB
        0x61,
        0x62,
        0x63,
        // Multiple Resource Entry 2
        0x00, // ResourceId LSB
        0x01, // ResourceId MSB
        LWM2M_TYPE.STRING,
        0x03, // Length of resource data LSB
        0x00, // Length of resource data MSB
        0x64,
        0x65,
        0x66,
      ]));
      expect(Object.keys(resources).length).to.equal(1);
      expect(resources[0].value[5].value).to.equal('abc');
      expect(resources[0].value[256].value).to.equal('def');
    });

    it('should parse a multiple Resource', () => {
      const payload = '0000050100640100050200012c020005010001060005010001070005010055';
      const resources = {};
      let resourcePayload = Buffer.from(payload, 'hex');
      while (resourcePayload.length > 0) {
        resourcePayload = Resource.parse(resources, resourcePayload);
      }
      expect(Object.keys(resources).length).to.equal(5);
      expect(resources[0].toInteger()).to.equal(100);
      expect(resources[1].toBuffer()).to.deep.equal(Buffer.from([1, 44]));
      expect(resources[2].toInteger()).to.equal(1);
      expect(resources[6].toInteger()).to.equal(1);
      expect(resources[7].toString()).to.equal('U');
    });

  });

  describe('#update()', () => {
    it('should call set() function with null whenver a given argument is undefined', (done) => {
      let myValue = 0;
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: {
          set(newValue) {
            return new Promise(resolve => {
              myValue = newValue;
              resolve();
            });
          }
        }
      }).then((r) => {
        return r.update(undefined);
      }).then(() => {
        // await myValue udpate inside the above promise callback
        expect(myValue).to.equal(null);
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should call set() function when a Resource having undefined value is passed', (done) => {
      let myValue = 0;
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: {
          set(newValue) {
            myValue = newValue;
          }
        }
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: ''
        }).then((newValue) => {
          // force set undefined for edge case testing
          newValue.value = undefined;
          return r.update(newValue);
        }).then(() => {
          expect(myValue).to.equal(null);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should call async set() function when a String is passed', (done) => {
      let myValue = 0;
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: {
          set(newValue) {
            return new Promise(resolve => {
              myValue = newValue;
              resolve();
            });
          }
        }
      }).then((r) => {
        return r.update('abcdef');
      }).then(() => {
        // await myValue udpate inside the above promise callback
        expect(myValue).to.equal('abcdef');
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should call set() function when a Resource is passed', (done) => {
      let myValue = 0;
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: {
          set(newValue) {
            myValue = newValue;
          }
        }
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: 'abcdef'
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(myValue).to.equal('abcdef');
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should update a String value', (done) => {
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: 'xyz'
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: 'abcdef'
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal('abcdef');
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn a Buffer object into a String value when a String Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: 'xyz'
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE,
          value: Buffer.from('abcdef')
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal('abcdef');
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn a Buffer object into an integer value when an Integer Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.INTEGER,
        acl: ACL.WRITABLE,
        value: 1000
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE,
          value: Buffer.from([1, 44])
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
          expect(r.value).to.equal(300);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn a Buffer object into a double/float value when an Float Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.FLOAT,
        acl: ACL.WRITABLE,
        value: 1
      }).then((r) => {
        const doubleBuf = Buffer.alloc(8);
        doubleBuf.writeDoubleBE(1234.56);
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE,
          value: doubleBuf
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.type).to.equal(LWM2M_TYPE.FLOAT);
          expect(r.value).to.be.closeTo(1234.56, 0.001);
        }).then(() => {
          const longDoubleBuf = Buffer.alloc(10);
          longDoubleBuf.writeDoubleBE(1234.56, 2);
          return Resource.from({
            type: LWM2M_TYPE.OPAQUE,
            value: longDoubleBuf
          });
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.type).to.equal(LWM2M_TYPE.FLOAT);
          expect(r.value).to.equal(0);
        }).then(() => {
          const floatBuf = Buffer.alloc(4);
          floatBuf.writeFloatBE(1234.56);
          return Resource.from({
            type: LWM2M_TYPE.OPAQUE,
            value: floatBuf
          });
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.type).to.equal(LWM2M_TYPE.FLOAT);
          expect(r.value).to.be.closeTo(1234.56, 0.001);
        }).then(() => {
          const longFloatBuf = Buffer.alloc(6);
          longFloatBuf.writeFloatBE(1234.56, 2);
          return Resource.from({
            type: LWM2M_TYPE.OPAQUE,
            value: longFloatBuf
          });
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.type).to.equal(LWM2M_TYPE.FLOAT);
          expect(r.value).to.equal(0);
        }).then(() => {
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should udpate an opaque Resource', (done) => {
      Resource.from({
        type: LWM2M_TYPE.OPAQUE,
        acl: ACL.READABLE,
        value: Buffer.from('xyz')
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE,
          value: Buffer.from('abcdef')
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.deep.equal(Buffer.from('abcdef'));
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn a String object into a Buffer value when an opaque Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.OPAQUE,
        acl: ACL.WRITABLE,
        value: 111
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: '123456abcdef'
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.deep.equal(Buffer.from('123456abcdef'));
          expect(r.acl).to.equal(ACL.WRITABLE);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should update an integer Resource', (done) => {
      Resource.from({
        type: LWM2M_TYPE.INTEGER,
        acl: ACL.WRITABLE,
        value: 111
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.INTEGER,
          value: 9999
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(9999);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn a String object into an int value when an integer Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.INTEGER,
        acl: ACL.WRITABLE,
        value: 111
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: '9999'
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(9999);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should update a float Resource', (done) => {
      Resource.from({
        type: LWM2M_TYPE.FLOAT,
        acl: ACL.WRITABLE,
        value: 111
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.FLOAT,
          value: 99.99
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(99.99);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn a String object into a float value when a float Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.FLOAT,
        acl: ACL.WRITABLE,
        value: 111
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: '99.99'
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(99.99);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should update a Boolean Resource', (done) => {
      Resource.from({
        type: LWM2M_TYPE.BOOLEAN,
        acl: ACL.WRITABLE,
        value: true
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.BOOLEAN,
          value: false
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(false);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn a String object into false when a Boolean Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.BOOLEAN,
        acl: ACL.WRITABLE,
        value: true
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: 'false' // string boolean value is NOT ACCEPTABLE!
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(true); // not empty string is `true`
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn an integer into false when a Boolean Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.BOOLEAN,
        acl: ACL.WRITABLE,
        value: true
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.INTEGER,
          value: 0,
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(false);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn an integer into true when a Boolean Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.BOOLEAN,
        acl: ACL.WRITABLE,
        value: false
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.INTEGER,
          value: 1,
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(true);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn an opaque value into false when a Boolean Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.BOOLEAN,
        acl: ACL.WRITABLE,
        value: true
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE,
          value: Buffer.from([0]),
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(false);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should turn an opaque value into true when a Boolean Resource is updated', (done) => {
      Resource.from({
        type: LWM2M_TYPE.BOOLEAN,
        acl: ACL.WRITABLE,
        value: false
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE,
          value: Buffer.from([1]),
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.equal(true);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should update an ObjectLink Resource', (done) => {
      Resource.from({
        type: LWM2M_TYPE.OBJECT_LINK,
        acl: ACL.WRITABLE,
        value: {}
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.OBJECT_LINK,
          value: {
            objectId: 123,
            objectInstanceId: 987
          }
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value).to.deep.equal({
            objectId: 123,
            objectInstanceId: 987
          });
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should return 4.00 Bad Request Error on updating ObjectLink', (done) => {
      Resource.from({
        type: LWM2M_TYPE.OBJECT_LINK,
        acl: ACL.WRITABLE,
        value: {}
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: '1234567890'
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          done('error');
        });
      }).catch((err) => {
        expect(err.status).to.equal(COAP_ERROR.COAP_400_BAD_REQUEST);
        done();
      });
    });
    it('should update a Multiple Resource', (done) => {
      Resource.from({
        type: LWM2M_TYPE.MULTIPLE_RESOURCE,
        acl: ACL.WRITABLE,
        value: {}
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.MULTIPLE_RESOURCE,
          value: {
            '0': {
              type: LWM2M_TYPE.FLOAT,
              value: 99.99
            }
          }
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.value[0].type).to.equal(LWM2M_TYPE.FLOAT);
          expect(r.value[0].value).to.equal(99.99);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should update a Multiple Resource with simpler value expression', (done) => {
      Resource.from({
        type: LWM2M_TYPE.MULTIPLE_RESOURCE,
        acl: ACL.WRITABLE,
        value: {}
      }).then((r) => {
        return Resource.from([11.11, 22.22]).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(Object.keys(r.value).length).to.equal(2);
          expect(r.value[0].type).to.equal(LWM2M_TYPE.FLOAT);
          expect(r.value[0].value).to.equal(11.11);
          expect(r.value[1].type).to.equal(LWM2M_TYPE.FLOAT);
          expect(r.value[1].value).to.equal(22.22);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
    it('should return 4.00 Bad Request Error on updating Multiple Resource', (done) => {
      Resource.from({
        type: LWM2M_TYPE.MULTIPLE_RESOURCE,
        acl: ACL.WRITABLE,
        value: {}
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.STRING,
          value: 'abcdef'
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          done('error');
        });
      }).catch((err) => {
        expect(err.status).to.equal(COAP_ERROR.COAP_400_BAD_REQUEST);
        done();
      });
    });
    it('should call set function in a Resource', (done) => {
      let setValue = null;
      Resource.from({
        type: LWM2M_TYPE.BOOLEAN,
        value: {
          set: (v) => {
            setValue = !!v[0]; // => Buffer.from([1])
          },
          get: () => {
            return setValue;
          }
        }
      }).then((r) => {
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE,
          acl: ACL.WRITABLE,
          value: Buffer.from([1])
        }).then((newValue) => {
          return r.update(newValue);
        }).then(() => {
          expect(r.toValue()).to.equal(true);
          done();
        });
      }).catch((err) => {
        done(err);
      });
    });
  });

  describe('#from()', () => {
    it('should create a String Resource object from String', (done) => {
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        sensitive: true,
        value: 'abcdef'
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.STRING);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.sensitive).to.equal(true);
        expect(r.value).to.equal('abcdef');

        return Resource.from('abcdef');
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.STRING);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.sensitive).to.be.undefined;
        expect(r.value).to.equal('abcdef');

        return Resource.from({
          type: LWM2M_TYPE.STRING
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.STRING);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.equal('');

        return Resource.from({
          '1': 'abcdef'
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.sensitive).to.be.undefined;
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].value).to.equal('abcdef');

        return Resource.from(['abcdef']);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.sensitive).to.be.undefined;
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].value).to.equal('abcdef');

      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should create an Interger Resource object from an int value', (done) => {
      Resource.from({
        type: LWM2M_TYPE.INTEGER,
        acl: ACL.WRITABLE | ACL.DELETABLE,
        value: 123456789
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
        expect(r.acl).to.equal(ACL.WRITABLE | ACL.DELETABLE);
        expect(r.value).to.equal(123456789);
        return Resource.from(123456789);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.equal(123456789);
        return Resource.from({
          type: LWM2M_TYPE.INTEGER
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.equal('');
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should create a Float Resource object from a double value', (done) => {
      Resource.from({
        type: LWM2M_TYPE.FLOAT,
        acl: ACL.WRITABLE,
        value: 12345.6789
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.FLOAT);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.equal(12345.6789);
        return Resource.from(12345.6789);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.FLOAT);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.equal(12345.6789);
        return Resource.from({
          type: LWM2M_TYPE.FLOAT
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.FLOAT);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.equal('');
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should create a Boolean Resource object from a boolean value', (done) => {
      Resource.from({
        type: LWM2M_TYPE.BOOLEAN,
        acl: ACL.WRITABLE,
        value: true
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.BOOLEAN);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.equal(true);
        return Resource.from(false);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.BOOLEAN);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.equal(false);
        return Resource.from({
          type: LWM2M_TYPE.BOOLEAN
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.BOOLEAN);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.equal('');
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should create a Object Link Resource object', (done) => {
      Resource.from({
        type: LWM2M_TYPE.OBJECT_LINK,
        acl: ACL.WRITABLE,
        value: {
          objectId: 999,
          objectInstanceId: 0
        }
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.OBJECT_LINK);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value.objectId).to.equal(999);
        expect(r.value.objectInstanceId).to.equal(0);
        return Resource.from({
          type: LWM2M_TYPE.OBJECT_LINK
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.OBJECT_LINK);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value.objectId).to.equal(0);
        expect(r.value.objectInstanceId).to.equal(0);
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should create a Buffer Resource object from a Buffer object', (done) => {
      Resource.from({
        type: LWM2M_TYPE.OPAQUE,
        acl: ACL.WRITABLE,
        value: Buffer.from([1,2,3])
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.OPAQUE);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.deep.equal(Buffer.from([1,2,3]));
        return Resource.from(Buffer.from([3,2,1]));
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.OPAQUE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.deep.equal(Buffer.from([3,2,1]));
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE,
          value: Buffer.from('abcdef')
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.OPAQUE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.deep.equal(Buffer.from('abcdef'));
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.OPAQUE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.deep.equal(Buffer.from([]));
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should create a Multiple Resource object from a string array', (done) => {
      Resource.from([{
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: 'abcdefgh'
      }]).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(1);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.WRITABLE);
        expect(r.value[0].value).to.equal('abcdefgh');

        return Resource.from(r);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(1);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.WRITABLE);
        expect(r.value[0].value).to.equal('abcdefgh');

        return Resource.from({
          type: LWM2M_TYPE.MULTIPLE_RESOURCE,
          acl: ACL.WRITABLE,
          value: [{
            type: LWM2M_TYPE.STRING,
            acl: ACL.WRITABLE,
            value: 'abcdefgh'
          }]
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(1);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.WRITABLE);
        expect(r.value[0].value).to.equal('abcdefgh');

        return Resource.from({
          type: LWM2M_TYPE.MULTIPLE_RESOURCE,
          acl: ACL.WRITABLE,
          value: ['123', '456']
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(2);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.DEFAULT);
        expect(r.value[0].value).to.equal('123');
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.DEFAULT);
        expect(r.value[1].value).to.equal('456');

        return Resource.from(['123', '456']);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(2);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.DEFAULT);
        expect(r.value[0].value).to.equal('123');
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.DEFAULT);
        expect(r.value[1].value).to.equal('456');

        return Resource.from({
          type: LWM2M_TYPE.MULTIPLE_RESOURCE,
          acl: ACL.WRITABLE,
          value: {
            1: '123',
            99: '456'
          }
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(2);
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.DEFAULT);
        expect(r.value[1].value).to.equal('123');
        expect(r.value[99]).to.be.an.instanceof(Resource);
        expect(r.value[99].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[99].acl).to.equal(ACL.DEFAULT);
        expect(r.value[99].value).to.equal('456');

        return Resource.from({
          type: LWM2M_TYPE.MULTIPLE_RESOURCE,
          acl: ACL.WRITABLE,
          value() {
            return ['123', '456'];
          }
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(2);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.DEFAULT);
        expect(r.value[0].value).to.equal('123');
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.DEFAULT);
        expect(r.value[1].value).to.equal('456');

        return Resource.from({
          type: LWM2M_TYPE.MULTIPLE_RESOURCE,
          acl: ACL.WRITABLE,
          value() {
            return Promise.resolve(['123', '456']);
          }
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(2);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.DEFAULT);
        expect(r.value[0].value).to.equal('123');
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.DEFAULT);
        expect(r.value[1].value).to.equal('456');

        return Resource.from({
          type: 'MULTIPLE_RESOURCE',
          value: {
            '0': {
              type: 'OBJECT_LINK',
              value: {
                objectId: 999,
                objectInstanceId: 111
              }
            }
          }
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(1);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.OBJECT_LINK);
        expect(r.value[0].acl).to.equal(ACL.DEFAULT);
        expect(r.value[0].value.objectId).to.equal(999);
        expect(r.value[0].value.objectInstanceId).to.equal(111);

      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should create a function Resource object', (done) => {
      Resource.from({
        type: LWM2M_TYPE.FUNCTION,
        acl: ACL.WRITABLE,
        value: Buffer.from([1,2,3])
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.FUNCTION);
        expect(r.acl).to.equal(ACL.WRITABLE | ACL.EXECUTABLE);
        expect(r.value).to.be.undefined;

        return Resource.from({
          type: 'FUNCTION',
          acl: 'W',
          value: 'abcdefg'
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.FUNCTION);
        expect(r.acl).to.equal(ACL.WRITABLE | ACL.EXECUTABLE);
        expect(r.value).to.be.undefined;

        return Resource.from({
          type: LWM2M_TYPE.FUNCTION,
          acl: ACL.READABLE,
          value() {
            return 'ok';
          }
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.FUNCTION);
        expect(r.acl).to.equal(ACL.READABLE | ACL.EXECUTABLE);
        expect(r.value).to.be.undefined;

      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should retain a function value in Resource object', (done) => {
      const obj = {
        state: 'ABC'
      };
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.READABLE,
        value: {
          get() {
            return obj.state;
          }
        }
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.STRING);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.toValue()).to.equal('ABC');
        return r;

      }).then((r) => {
        obj.state = 'XYZ';
        expect(r.type).to.equal(LWM2M_TYPE.STRING);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.toValue()).to.equal('XYZ');
        expect(r.toString()).to.equal('XYZ');
        expect(r.toBuffer()).to.deep.equal(Buffer.from('XYZ'));

      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    // end of '#from()'
  });
  describe('#destroy()', () => {
    it('should perform fini() function', (done) => {
      Resource.from({
        type: LWM2M_TYPE.INTEGER,
        acl: ACL.READABLE,
        value: {
          init() {
            this.myVal = 1;
          },
          get() {
            return this.myVal;
          },
          fini() {
            this.myVal = -1;
            return Promise.resolve();
          }
        }
      }).then((r) => {
        expect(r.initialized).to.equal(true);
        expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.toValue()).to.equal(1);
        return r.destroy();

      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.toValue()).to.equal(-1);

      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    // end of '#destroy()'
  });
  describe('#toJSON()', () => {
    it('should return an object for generating JSON string', (done) => {
      Resource.from([{
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: 'abcdefgh'
      }]).then((r) => {
        const j = r.toJSON();
        expect(j.type).to.equal('MULTIPLE_RESOURCE');
        expect(j.acl).to.equal('RWD');
        expect(j.value).to.be.an('object');
        expect(Object.keys(j.value).length).to.equal(1);
        expect(r.value[0]).to.be.an('object');
        expect(j.value[0].type).to.equal('STRING');
        expect(j.value[0].acl).to.equal('W');
        expect(j.value[0].value).to.equal('abcdefgh');
        return Resource.from(j);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.DEFAULT);
        expect(r.value).to.be.an('object');
        expect(Object.keys(r.value).length).to.equal(1);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.WRITABLE);
        expect(r.value[0].value).to.equal('abcdefgh');
        done();
      }).catch((err) => {
        done(err);
      });
    });
    // end of #toJSON()
  });
  // end of 'Resource'
});
