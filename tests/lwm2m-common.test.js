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
  Resource
} from './lwm2m-common';
import {
  LWM2M_TYPE,
  ACL,
} from './object-common';

chai.should();
chai.use(sinonChai);
const expect = chai.expect;

describe('Resource', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });
  afterEach(() => {
    sandbox.restore();
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
