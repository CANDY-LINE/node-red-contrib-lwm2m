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
import * as sinon from 'sinon';
import chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  Resource, LwM2MClientProxy, RequestHandler, ResourceRepositoryBuilder
} from './lwm2m-common';
import {
  LWM2M_TYPE,
  ACL,
} from './object-common';

chai.should();
chai.use(sinonChai);
const expect = chai.expect;
const HEADER_LEN = 5;

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
        expect(r.uris).to.deep.equal(['/2/0/0']);
        expect(r.resourceLen).to.equal(1);
        r = RequestHandler.build(client, 'read', Buffer.from('AQECAAAAAAA=', 'base64'));
        expect(r.resourceLen).to.equal(0);
        expect(r.uris).to.deep.equal(['/2/0/*']);
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

  describe('#serialize()', () => {
    it('should serialize a Resource', (done) => {
      Resource.from('string').then((r) => {
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('string');

        return Resource.from('');
      }).then((r) => {
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('');

        return Resource.from(0);
      }).then((r) => {
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('0');

        return Resource.from(0.1);
      }).then((r) => {
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('0.1');

        return Resource.from({type:LWM2M_TYPE.FLOAT});
      }).then((r) => {
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length).toString()).to.equal('0');

        return Resource.from({type:LWM2M_TYPE.OPAQUE, value:Buffer.from([1,2,3])});
      }).then((r) => {
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length)).to.deep.equal(Buffer.from([1,2,3]));

        return Resource.from({type:LWM2M_TYPE.OPAQUE, value:[1,2,3]});
      }).then((r) => {
        let buf = r.serialize();
        expect(buf.slice(HEADER_LEN, buf.length)).to.deep.equal(Buffer.from([1,2,3]));

        return Resource.from({type:LWM2M_TYPE.OPAQUE});
      }).then((r) => {
        let buf;

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

  describe('#from()', () => {
    it('should create a String Resource object from String', (done) => {
      Resource.from({
        type: LWM2M_TYPE.STRING,
        acl: ACL.WRITABLE,
        value: 'abcdef'
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.STRING);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.equal('abcdef');
        return Resource.from('abcdef');
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.STRING);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.equal('abcdef');
      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    it('should create an Interger Resource object from an int value', (done) => {
      Resource.from({
        type: LWM2M_TYPE.INTEGER,
        acl: ACL.WRITABLE,
        value: 123456789
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
        expect(r.acl).to.equal(ACL.WRITABLE);
        expect(r.value).to.equal(123456789);
        return Resource.from(123456789);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.equal(123456789);
        return Resource.from({
          type: LWM2M_TYPE.INTEGER
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.INTEGER);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.equal(0);
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
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.equal(12345.6789);
        return Resource.from({
          type: LWM2M_TYPE.FLOAT
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.FLOAT);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.equal(0);
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
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.equal(false);
        return Resource.from({
          type: LWM2M_TYPE.BOOLEAN
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.BOOLEAN);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.equal(false);
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
        expect(r.acl).to.equal(ACL.READABLE);
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
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.deep.equal(Buffer.from([3,2,1]));
        return Resource.from({
          type: LWM2M_TYPE.OPAQUE
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.OPAQUE);
        expect(r.acl).to.equal(ACL.READABLE);
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
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.be.an('array');
        expect(r.value.length).to.equal(1);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.WRITABLE);
        expect(r.value[0].value).to.equal('abcdefgh');

        return Resource.from(r);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.be.an('array');
        expect(r.value.length).to.equal(1);
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
        expect(r.value).to.be.an('array');
        expect(r.value.length).to.equal(1);
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
        expect(r.value).to.be.an('array');
        expect(r.value.length).to.equal(2);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.READABLE);
        expect(r.value[0].value).to.equal('123');
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.READABLE);
        expect(r.value[1].value).to.equal('456');

        return Resource.from(['123', '456']);
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.MULTIPLE_RESOURCE);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.be.an('array');
        expect(r.value.length).to.equal(2);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.READABLE);
        expect(r.value[0].value).to.equal('123');
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.READABLE);
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
        expect(r.value[1].acl).to.equal(ACL.READABLE);
        expect(r.value[1].value).to.equal('123');
        expect(r.value[99]).to.be.an.instanceof(Resource);
        expect(r.value[99].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[99].acl).to.equal(ACL.READABLE);
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
        expect(r.value).to.be.an('array');
        expect(r.value.length).to.equal(2);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.READABLE);
        expect(r.value[0].value).to.equal('123');
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.READABLE);
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
        expect(r.value).to.be.an('array');
        expect(r.value.length).to.equal(2);
        expect(r.value[0]).to.be.an.instanceof(Resource);
        expect(r.value[0].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[0].acl).to.equal(ACL.READABLE);
        expect(r.value[0].value).to.equal('123');
        expect(r.value[1]).to.be.an.instanceof(Resource);
        expect(r.value[1].type).to.equal(LWM2M_TYPE.STRING);
        expect(r.value[1].acl).to.equal(ACL.READABLE);
        expect(r.value[1].value).to.equal('456');

        return Resource.from({
          type: LWM2M_TYPE.STRING
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.STRING);
        expect(r.acl).to.equal(ACL.READABLE);
        expect(r.value).to.equal('');

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
        expect(r.acl).to.equal(ACL.EXECUTABLE);
        expect(r.value).to.be.undefined;

        return Resource.from({
          type: 'FUNCTION',
          acl: 'W',
          value: 'abcdefg'
        });
      }).then((r) => {
        expect(r.type).to.equal(LWM2M_TYPE.FUNCTION);
        expect(r.acl).to.equal(ACL.EXECUTABLE);
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
        expect(r.acl).to.equal(ACL.EXECUTABLE);
        expect(r.value).to.be.undefined;

      }).then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });
    // end of '#from()'
  });
  // end of 'Resource'
});
