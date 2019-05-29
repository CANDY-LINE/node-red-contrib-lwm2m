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
  ACL,
} from './object-common';

export default {
  0: {
    // Object ID
    0: {
      type: LWM2M_TYPE.INTEGER,
      acl: ACL.READWRITE | ACL.DELETABLE,
      value: 0, // Security Object
    },
    // Instance ID
    1: {
      type: LWM2M_TYPE.INTEGER,
      acl: ACL.READWRITE | ACL.DELETABLE,
      value: 0
    },
    // ACL
    2: {
      type: LWM2M_TYPE.MULTIPLE_RESOURCE,
      acl: ACL.READWRITE | ACL.DELETABLE,
      value: {
        0: ACL.ALL
      }
    },
    // Access Control Owner (Server ID)
    3: {
      type: LWM2M_TYPE.INTEGER,
      acl: ACL.READWRITE | ACL.DELETABLE,
      value: 0
    }
  }
};
