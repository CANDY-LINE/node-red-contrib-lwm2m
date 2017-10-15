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
  ACL,
} from './object-common';

chai.should();
chai.use(sinonChai);
const expect = chai.expect;

describe('ACL', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });
  afterEach(() => {
    sandbox.restore();
  });

  describe('#toValue()', () => {
    it('should turn an ACL string into a valid 16-bit int', () => {
      expect(ACL.toValue(ACL.READABLE)).to.equal(ACL.READABLE);
      expect(ACL.toValue(ACL.WRITABLE)).to.equal(ACL.WRITABLE);
      expect(ACL.toValue(ACL.DELETABLE)).to.equal(ACL.DELETABLE);
      expect(ACL.toValue(ACL.EXECUTABLE)).to.equal(ACL.EXECUTABLE);
      expect(ACL.toValue(ACL.CREATABLE)).to.equal(ACL.CREATABLE);
      expect(ACL.toValue(ACL.ALL)).to.equal(ACL.ALL);

      expect(ACL.toValue('R')).to.equal(ACL.READABLE);
      expect(ACL.toValue('W')).to.equal(ACL.WRITABLE);
      expect(ACL.toValue('D')).to.equal(ACL.DELETABLE);
      expect(ACL.toValue('E')).to.equal(ACL.EXECUTABLE);
      expect(ACL.toValue('C')).to.equal(ACL.CREATABLE);

      expect(ACL.toValue('RW')).to.equal(ACL.READWRITE);
      expect(ACL.toValue('DW')).to.equal(ACL.WRITABLE | ACL.DELETABLE);
      expect(ACL.toValue('RD')).to.equal(ACL.READABLE | ACL.DELETABLE);

      expect(ACL.toValue('RWD')).to.equal(ACL.READABLE | ACL.WRITABLE | ACL.DELETABLE);
      expect(ACL.toValue('DWR')).to.equal(ACL.READABLE | ACL.WRITABLE | ACL.DELETABLE);
      expect(ACL.toValue('CRD')).to.equal(ACL.CREATABLE | ACL.READABLE | ACL.DELETABLE);

      expect(ACL.toValue('ECRDW')).to.equal(ACL.EXECUTABLE | ACL.CREATABLE | ACL.READABLE | ACL.DELETABLE | ACL.WRITABLE);
      expect(ACL.toValue('ECRDW')).to.equal(ACL.ALL);
    });
    // end of '#toValue()'
  });

  describe('#toString()', () => {
    it('should turn a ACL 16-bit int into a string', () => {
      expect(ACL.toString('R')).to.equal('R');
      expect(ACL.toString(ACL.READABLE)).to.equal('R');
      expect(ACL.toString(ACL.WRITABLE)).to.equal('W');
      expect(ACL.toString(ACL.DELETABLE)).to.equal('D');
      expect(ACL.toString(ACL.EXECUTABLE)).to.equal('E');
      expect(ACL.toString(ACL.CREATABLE)).to.equal('C');
      expect(ACL.toString(ACL.READABLE | ACL.WRITABLE)).to.equal('RW');
      expect(ACL.toString(ACL.CREATABLE | ACL.READABLE | ACL.DELETABLE)).to.equal('RDC');
      expect(ACL.toString(ACL.ALL)).to.equal('RWEDC');
    });
    // end of '#toString()'
  });
  // end of 'ACL'
});
