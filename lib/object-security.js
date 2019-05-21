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
import {
  LWM2M_TYPE,
} from './object-common';

export default {
  0: {
    // Server URI(String)
    0: '',
    // Bootstrap Server(Boolean)
    1: false,
    // Security Mode
    2: 0, // PSK(0), RPK(1), X509(2), NONE(3)
    // Public Key or ID(Opaque)
    3: {
      type: LWM2M_TYPE.OPAQUE,
      value: '' // See README.md for acceptable text format
    },
    // Server Public Key or ID
    4: {
      type: LWM2M_TYPE.OPAQUE,
      value: '' // See README.md for acceptable text format
    },
    // Secret Key
    5: {
      type: LWM2M_TYPE.OPAQUE,
      value: '' // See README.md for acceptable text format
    },
    // SMS Security Mode
    6: 0,
    // SMS Binding Key Param
    7: {
      type: LWM2M_TYPE.OPAQUE,
      value: '' // See README.md for acceptable text format
    },
    // SMS Binding Secret Keys
    8: {
      type: LWM2M_TYPE.OPAQUE,
      value: '' // See README.md for acceptable text format
    },
    // Server SMS Number
    9: '',
    // Short Server ID
    10: 0, // replaced by ResourceRepositoryBuilder
    // Client Hold Off Time
    11: 0,
    // BS Account Timeout
    12: 0
  }
};
