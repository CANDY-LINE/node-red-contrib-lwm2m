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
import si from 'systeminformation';

export default {
  0: {
    // #define RES_O_MANUFACTURER          0
    0: {
      type: LWM2M_TYPE.STRING,
      value() { // same as `value:{init() {}}`
        // Initializer Function (invoked once)
        return si.system().then((info) => {
          return Promise.resolve(info.manufacturer);
        });
      }
    },
    // #define RES_O_MODEL_NUMBER          1
    1: {
      type: LWM2M_TYPE.STRING,
      value() { // same as `value:{init() {}}`
        // Initializer Function (invoked once)
        return si.system().then((info) => info.model);
      }
    },
    // #define RES_O_SERIAL_NUMBER         2
    2: {
      type: LWM2M_TYPE.STRING,
      value() { // same as `value:{init() {}}`
        // Initializer Function (invoked once)
        return si.system().then((info) => info.serial);
      }
    },
    // #define RES_O_FIRMWARE_VERSION      3
    3: {
      type: LWM2M_TYPE.STRING,
      value() { // same as `value:{init() {}}`
        // Initializer Function (invoked once)
        return si.osInfo().then((info) => info.release);
      }
    },
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
    6: {
      type: LWM2M_TYPE.MULTIPLE_RESOURCE,
      value() {
        let sources = [0];
        return si.battery().then((info) => {
          if (info.hasbattery) {
            sources.push(1);
          }
          return sources;
        });
      }
    },
    // #define RES_O_POWER_SOURCE_VOLTAGE  7
    7: {
      type: LWM2M_TYPE.MULTIPLE_RESOURCE,
      value: {
        // Initializer Function (invoked once)
        init() {
          let sources = [0];
          return si.battery().then((info) => {
            if (info.hasbattery) {
              sources.push(0);
            }
            return sources;
          });
        }
      }
    },
    // #define RES_O_POWER_SOURCE_CURRENT  8
    8: {
      type: LWM2M_TYPE.MULTIPLE_RESOURCE,
      value: {
        // Initializer Function (invoked once)
        init() {
          let sources = [0];
          return si.battery().then((info) => {
            if (info.hasbattery) {
              sources.push(0);
            }
            return sources;
          });
        }
      }
    },
    // #define RES_O_BATTERY_LEVEL         9
    9 : {
      type: LWM2M_TYPE.INTEGER,
      value() { // same as `value:{init() {}}`
        // Initializer Function (invoked once)
        return si.battery().then((info) => info.percent);
      }
    },
    // #define RES_O_MEMORY_FREE           10
    10 : {
      type: LWM2M_TYPE.INTEGER,
      value() { // same as `value:{init() {}}`
        // Initializer Function (invoked once)
        return si.mem().then((info) => info.free);
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
    15 : {
      type: LWM2M_TYPE.STRING,
      value() {
        return si.time().timezoneName;
      }
    },
    // #define RES_M_BINDING_MODES         16
    16 : 'U',

    // since TS 20141126-C:
    // #define RES_O_DEVICE_TYPE           17
    17 : 'Computer',
    // #define RES_O_HARDWARE_VERSION      18
    18 : {
      type: LWM2M_TYPE.STRING,
      value() {
        return si.system().then((info) => info.version);
      }
    },
    // #define RES_O_SOFTWARE_VERSION      19
    19 : require('../package.json').version,
    // #define RES_O_BATTERY_STATUS        20
    // 0	Normal	The battery is operating normally and not on power.
    // 1	Charging	The battery is currently charging.
    // 2	Charge Complete	The battery is fully charged and still on power.
    // 3	Damaged	The battery has some problem.
    // 4	Low Battery	The battery is low on charge.
    // 5	Not Installed	The battery is not installed.
    // 6	Unknown	The battery information is not available.]]></Description>
    20 : {
      type: LWM2M_TYPE.INTEGER,
      value() {
        return si.battery().then((info) => {
          if (info.hasbattery) {
            if (info.ischarging) {
              if (info.percent > 97) {
                return 2;
              }
              return 1;
            }
            if (info.percent < 15) {
              return 4;
            }
            return 0;
          }
          return 5;
        });
      }
    },
    // #define RES_O_MEMORY_TOTAL          21
    21 : {
      type: LWM2M_TYPE.INTEGER,
      value() {
        // Initializer Function (invoked once)
        return si.mem().then((info) => info.total);
      }
    },
  },
};
