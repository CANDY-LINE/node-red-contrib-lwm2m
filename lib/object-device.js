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
import {
  LWM2M_TYPE,
  ACL,
} from './object-common';
import os from 'os';

/*
#define PRV_MANUFACTURER      "Open Mobile Alliance"
#define PRV_MODEL_NUMBER      "Lightweight M2M Client"
#define PRV_SERIAL_NUMBER     "345000123"
#define PRV_FIRMWARE_VERSION  "1.0"
#define PRV_POWER_SOURCE_1    1
#define PRV_POWER_SOURCE_2    5
#define PRV_POWER_VOLTAGE_1   3800
#define PRV_POWER_VOLTAGE_2   5000
#define PRV_POWER_CURRENT_1   125
#define PRV_POWER_CURRENT_2   900
#define PRV_BATTERY_LEVEL     100
#define PRV_MEMORY_FREE       15
#define PRV_ERROR_CODE        0
#define PRV_TIME_ZONE         "Europe/Berlin"
#define PRV_BINDING_MODE      "U"

#define PRV_OFFSET_MAXLEN   7 //+HH:MM\0 at max
#define PRV_TLV_BUFFER_SIZE 128
*/

export default {
  0: {
    // #define RES_O_MANUFACTURER          0
    0: 'Open Mobile Alliance',
    // #define RES_O_MODEL_NUMBER          1
    1: 'Lightweight M2M Client',
    // #define RES_O_SERIAL_NUMBER         2
    2: '345000123',
    // #define RES_O_FIRMWARE_VERSION      3
    3: '1.0',
    // #define RES_M_REBOOT                4
    4: {
      type: LWM2M_TYPE.FUNCTION,
      acl: ACL.EXECUTABLE,
    },
    // #define RES_O_FACTORY_RESET         5
    5: {
      type: LWM2M_TYPE.FUNCTION,
      acl: ACL.EXECUTABLE,
    },
    // #define RES_O_AVL_POWER_SOURCES     6
    // 0 – DC power
    // 1 – Internal Battery
    // 2 – External Battery
    // 4 – Power over Ethernet
    // 5 – USB
    // 6 – AC (Mains) power
    // 7 – Solar
    6: [
      0
    ],
    // #define RES_O_POWER_SOURCE_VOLTAGE  7
    7: {
      type: LWM2M_TYPE.MULTIPLE_RESOURCE,
      value: {
        // Initializer Function (invoked once)
        init() {
          return [
            5.0 // Raspberry Pi
          ];
        }
      }
    },
    // #define RES_O_POWER_SOURCE_CURRENT  8
    8 : [
      0
    ],
    // #define RES_O_BATTERY_LEVEL         9
    9 : 0,
    // #define RES_O_MEMORY_FREE           10
    10 : {
      type: LWM2M_TYPE.INTEGER,
      value() { // same as `value:{init() {}}`
        // Initializer Function (invoked once)
        return os.freemem();
      }
    },
    // #define RES_M_ERROR_CODE            11
    // 0=No error
    // 1=Low battery power
    // 2=External power supply off
    // 3=GPS module failure
    // 4=Low received signal strength
    // 5=Out of memory
    // 6=SMS failure
    // 7=IP connectivity failure
    // 8=Peripheral malfunction
    11 : 0,
    // #define RES_O_RESET_ERROR_CODE      12
    12 : {
      type: LWM2M_TYPE.FUNCTION,
      acl: ACL.EXECUTABLE,
    },
    // #define RES_O_CURRENT_TIME          13
    13 : {
      type: LWM2M_TYPE.INTEGER,
      value() {
        // Initializer Function (invoked once)
        return parseInt(Date.now() / 1000);
      }
    },
    // #define RES_O_UTC_OFFSET            14
    14 : {
      type: LWM2M_TYPE.STRING,
      value() {
        // Initializer Function (invoked once)
        let timezoneOffset = new Date().getTimezoneOffset();
        let out = timezoneOffset < 0 ? '+' : '-';
        timezoneOffset = Math.abs(timezoneOffset);
        out += (('0' + (timezoneOffset / 60)).slice(-2) + ':');
        out += ('0' + (timezoneOffset % 60)).slice(-2);
        return out;
      }
    },
    // #define RES_O_TIMEZONE              15
    15 : '(unknown)',
    // #define RES_M_BINDING_MODES         16
    16 : 'U',

    // since TS 20141126-C:
    // #define RES_O_DEVICE_TYPE           17
    17 : 'Single Board Computer',
    // #define RES_O_HARDWARE_VERSION      18
    18 : '',
    // #define RES_O_SOFTWARE_VERSION      19
    19 : require('../package.json').version,
    // #define RES_O_BATTERY_STATUS        20
    20 : 0, // 0-6
    // #define RES_O_MEMORY_TOTAL          21
    21 : os.totalmem(), // same as `{ value() { return os.totalmem(); } }}`
  },
};
