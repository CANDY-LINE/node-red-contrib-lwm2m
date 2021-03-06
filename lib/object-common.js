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

export const COAP_ERROR = {
  COAP_NO_ERROR                   : 0x00,
  COAP_IGNORE                     : 0x01,

  COAP_201_CREATED                : 0x41,
  COAP_202_DELETED                : 0x42,
  COAP_204_CHANGED                : 0x44,
  COAP_205_CONTENT                : 0x45,
  COAP_231_CONTINUE               : 0x5F,
  COAP_400_BAD_REQUEST            : 0x80,
  COAP_401_UNAUTHORIZED           : 0x81,
  COAP_402_BAD_OPTION             : 0x82,
  COAP_404_NOT_FOUND              : 0x84,
  COAP_405_METHOD_NOT_ALLOWED     : 0x85,
  COAP_406_NOT_ACCEPTABLE         : 0x86,
  COAP_408_REQ_ENTITY_INCOMPLETE  : 0x88,
  COAP_412_PRECONDITION_FAILED    : 0x8C,
  COAP_413_ENTITY_TOO_LARGE       : 0x8D,
  COAP_500_INTERNAL_SERVER_ERROR  : 0xA0,
  COAP_501_NOT_IMPLEMENTED        : 0xA1,
  COAP_503_SERVICE_UNAVAILABLE    : 0xA3,
  toString(input) {
    return Object.keys(COAP_ERROR).filter((l) => COAP_ERROR[l] === input)[0] || `(unknown:${input})`;
  }
};

function toType(input, types, defaultValue) {
  if (typeof(input) === 'number') {
    return input;
  }
  let value = parseInt(input);
  if (value > 0 && Object.keys(types)[value]) {
    return value;
  }
  return types[input] || defaultValue;
}

function toString(input, types, defaultValue) {
  let value = parseInt(input);
  let label = Object.keys(types).filter((type) => types[type] === value);
  return label[0] || defaultValue;
}

export const LWM2M_OBJECT_ID = {
  SECURITY     : 0x0000,
  SERVER       : 0x0001,
  ACL          : 0x0002,
  DEVICE       : 0x0003,
  CONN_MONITOR : 0x0004,
  FIRMWARE     : 0x0005,
  LOCATION     : 0x0006,
  CONN_STATS   : 0x0007,
  toType(input, defaultType=LWM2M_OBJECT_ID.SECURITY) {
    return toType(input, LWM2M_OBJECT_ID, defaultType);
  },
  toString(input) {
    return toString(input, LWM2M_OBJECT_ID, 'SECURITY');
  }
};

// lwm2m_data_type_t
export const LWM2M_TYPE = {
  UNDEFINED         : 0x00,
  OBJECT            : 0x01,
  OBJECT_INSTANCE   : 0x02,
  MULTIPLE_RESOURCE : 0x03,
  STRING            : 0x04,
  OPAQUE            : 0x05,
  INTEGER           : 0x06,
  FLOAT             : 0x07,
  BOOLEAN           : 0x08,
  OBJECT_LINK       : 0x09,
  FUNCTION          : 0xf0, // custom type (not defined in Wakaama)
  toType(input) {
    return toType(input, LWM2M_TYPE, LWM2M_TYPE.UNDEFINED);
  },
  toString(input) {
    return toString(input, LWM2M_TYPE, 'UNDEFINED');
  }
};

// 1st LSB: R(Read, Observe, Discover, Write-Attributes)
// 2nd LSB: W(Write)
// 3rd LSB: E(Execute)
// 4th LSB: D(Delete)
// 5th LSB: C(Create)
export const ACL = {
  READABLE:     0x01,
  WRITABLE:     0x02,
  EXECUTABLE:   0x04,
  DELETABLE:    0x08,
  CREATABLE:    0x10,
  READWRITE:    0x03,
  ALL:          0x1f,
  DEFAULT:      0x03 | 0x08, // RWD
  isAllowed(input, policy) {
    return (input & policy) === policy;
  },
  toValue(input) {
    if (typeof(input) === 'number') {
      return input;
    }
    if (!input) {
      return ACL.DEFAULT;
    }
    let value = 0;
    let i;
    for (i = 0; i < input.length; i++) {
      switch (input[i]) {
        case 'R':
          value |= ACL.READABLE;
          break;
        case 'W':
          value |= ACL.WRITABLE;
          break;
        case 'E':
          value |= ACL.EXECUTABLE;
          break;
        case 'D':
          value |= ACL.DELETABLE;
          break;
        case 'C':
          value |= ACL.CREATABLE;
          break;
        default:
          value |= ACL.READABLE;
      }
    }
    return value;
  },
  toString(input) {
    if (typeof(input) === 'string') {
      input = ACL.toValue(input);
    }
    input = input || 0;
    let value = '';
    if (input & ACL.READABLE) {
      value += 'R';
    }
    if (input & ACL.WRITABLE) {
      value += 'W';
    }
    if (input & ACL.EXECUTABLE) {
      value += 'E';
    }
    if (input & ACL.DELETABLE) {
      value += 'D';
    }
    if (input & ACL.CREATABLE) {
      value += 'C';
    }
    return value;
  }
};
