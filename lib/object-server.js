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
    // Short ID
    0: 0, // replaced by ResourceRepositoryBuilder
    // Lifetime
    1: 0,
    // Default Min Period
    2: 0,
    // Default Max Period
    3: 0,
    // Disable
    4: {
      type: LWM2M_TYPE.FUNCTION,
      acl: ACL.EXECUTABLE,
    },
    // Disable Timeout
    5: 0,
    // Notification Storing
    6: false,
    // Binding
    7: '',
    // Registration Update
    8: {
      type: LWM2M_TYPE.FUNCTION,
      acl: ACL.EXECUTABLE,
    },
  }
};
