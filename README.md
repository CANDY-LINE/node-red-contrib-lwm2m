Node-RED node for OMA LwM2M
===

[![GitHub release](https://img.shields.io/github/release/CANDY-LINE/node-red-contrib-lwm2m.svg)](https://github.com/CANDY-LINE/node-red-contrib-lwm2m/releases/latest)
[![master Build Status](https://travis-ci.org/CANDY-LINE/node-red-contrib-lwm2m.svg?branch=master)](https://travis-ci.org/CANDY-LINE/node-red-contrib-lwm2m/)
[![License MIT](https://img.shields.io/github/license/CANDY-LINE/node-red-contrib-lwm2m.svg)](http://opensource.org/licenses/Apache-2.0)

This node offers OMA LwM2M client functionalities and allows you to create your own OMA LwM2M client applications on top of Node-RED.

This node internally spawns a [`wakatiwaiclient`](https://github.com/CANDY-LINE/wakatiwai) process, which is a revised version of [Eclipse Wakaama](https://github.com/eclipse/wakaama) executable, and starts inter-process communication (IPC) over stdin and stdout. The [`wakatiwaiclient`](https://github.com/CANDY-LINE/wakatiwai) executable is slightly different from [Wakaama](https://github.com/eclipse/wakaama)'s implementation, some of management objects are stripped. This node allows you to describe your own management objects as well.

When the parent process (i.e. Node-RED) exits, this node tries to emit a De-registration message to LwM2M server so that the server knows the client is gone.

This node restarts a new process when the child process exits after a given interval time passes.

CoAP over DTLS is supported but disabled by default. Users are able to enable DTLS if necessary. However, supported security mechanism is only pre-shared key(PSK). RPK and X.509 are not supported.

The supported message format is `TLV` rather than ~~`JSON`~~.

**Security Notice:**

Keep in mind that the inter-process communication over stdin/stdio is **NOT** encrypted and does **NOT** have any authentication mechanism.

# Features

## Installed Nodes

- `lwm2m client` ... a LwM2M client configuration node, having LwM2M server host, port and other connection settings as well as custom management objects
- `lwm2m client in` ... a Node-RED node emitting LwM2M server events and/or internal object query results
- `lwm2m client out` ... a Node-RED node accepting a Write/Execute operation message from the input port

All errors are propagated to Catch-all node.

The input and output nodes show the following connection status.

- bootstrap required
- bootstrapping
- register required
- registering
- connected
- disconnected
- error
- timeout
- *subscribed* - only for `lwm2m client in` node with `Subscribe LwM2M Object Events` checked

## Supported LwM2M operations

- `read`
- `write`
- `execute`
- `observe`
- `discover`
- `create`
- `delete`

## Bundled Objects

The following objects are implemented in Javascript. They can be overlaid with user defined object JSON (see below).

- `Security Object`
- `Server Object`
- `Access Control Object`
- `Device Object`

Security Notice) The project depends on [`systeminformation`](https://www.npmjs.com/package/systeminformation) package to collect system information. This package is excellent but it can expose sensitive information like serial number, device model and OS version to a LwM2M server. In order to avoid unexpected exposure to a public sandbox server, `Hide sensitive device info.` property is checked by default. So you need to uncheck it prior to sending entire device information from the node.

## User's Custom Objects and Object Overlay

This node allows you to create new objects and overlay bundled objects (not predefined objects).

With the powerful Node-RED JSON editor, you can easily manipulate your own management objects.

### Management Object JSON format

† Not compatible with LwM2M JSON data format

```
{
    "0": {                         => Object ID (M)
        "0": {                     => Instance ID (M)
            "0": {                 => Resource ID (M)
                "type": "...",     => Resource Type (see below) (M)
                "acl": "...",      => Resource ACL (see below) (O)
                "sensitive": true, => true if the value is sensitive (O)
                "value": "..."     => Resource Value (O)
            }
        }
    }
}
```

#### Resource Types

Supported resource types are as follows:

- `STRING` ... String
- `OPAQUE` ... Buffer (byte array)
- `INTEGER` ... 64bit integer
- `FLOAT` ... double
- `BOOLEAN` ... boolean (`STRING` value `1`, `INTEGER` value `1`, and `OPAQUE` 1st byte `1` are all translated into `true`)
- `OBJECT_LINK` ... Object Link
- `MULTIPLE_RESOURCE` ... Resource Array
- `FUNCTION` ... This is **NOT** a LwM2M Resource Type. Used for defining `execute` operation Resource

#### Resource Type JSON format

##### `STRING`

```
{
    "type": "STRING",
    "value": "Lorem ipsum"
}
```

or

```
"Lorem ipsum"
```

##### `OPAQUE`

```
{
    "type": "OPAQUE",
    "value": "Lorem ipsum"
}
```

or

```
{
    "type": "OPAQUE",
    "value": "base64:TG9yZW0gaXBzdW0="
}
```

or

```
{
    "type": "OPAQUE",
    "value": "hex:4c6f72656d20697073756d"
}
```

or

```
{
    "type": "OPAQUE",
    "value": [76,111,114,101,109,32,105,112,115,117,109]
}
```

or

```
{
    "type": "OPAQUE",
    "value": {
        "type": "Buffer",
        "data": [76,111,114,101,109,32,105,112,115,117,109]
    }
}
```

##### `INTEGER`

```
{
    "type": "INTEGER",
    "value": 1234567890
}
```

or

```
1234567890
```

 * The `"value"` property value is assumed as an empty packet by default when the property is missing.

##### `FLOAT`

```
{
    "type": "FLOAT",
    "value": 987654.321
}
```

or

```
987654.321
```

* The `"value"` property value is assumed as an empty packet by default when the property is missing.

##### `BOOLEAN`

```
{
    "type": "BOOLEAN",
    "value": false
}
```

or

```
true
```

* The `"value"` property value is assumed as an empty packet by default when the property is missing.

##### `OBJECT_LINK`

```
{
    "type": "OBJECT_LINK",
    "value": {
        "objectId": 999,
        "objectInstanceId": 0
    }
}
```

#### `MULTIPLE_RESOURCE`

The type is a collection having Resource Instance ID and Resource value pairs.

```
{
    "type": "MULTIPLE_RESOURCE",
    "value": {
        "100": 999,
        "101": true,
        "999": {
            "type": "FLOAT",
            "value": 987654.321
        }
    }
}
```

If the Resource Instance ID starts with "0" and its following IDs are 1,2,3... (increases by 1), you can provide a JSON Array like this.

```
{
    "type": "MULTIPLE_RESOURCE",
    "value": [
        123,
        false,
        {
            "type": "FLOAT",
            "value": 1234.567
        }
    ]
}
```

This is equivalent to:

```
{
    "type": "MULTIPLE_RESOURCE",
    "value": {
        "0": 123,
        "1": false,
        "2": {
            "type": "FLOAT",
            "value": 1234.567
        }
    }
}
```


##### `FUNCTION`

This type is out of OMA LwM2M specification scope. Used for defining an executable resource data. `value` property is always ignored and `acl` is always assumed as `E`(other values are silently ignored).

```
{
    "type": "FUNCTION"
}
```

#### ACL

ACL characters and allowed operations are shown below.

- `R` ... Read, Observe, Discover, Write-Attributes
- `W` ... Write
- `E` ... Execute
- `D` ... Delete
- `C` ... Create

Note that LwM2M Bootstrap server will try to remove all predefined objects during bootstrapping process. Set ACL properly if you'd like to preserve your objects.

## Global predefined objects

You can add your own systemwide custom objects by describing them in your `settings.js` or `RED.settings` objects.

Here's an example for providing the predefined manufacturer name.

`settings.js`
```
{
    lwm2m: {
        objects : {
            '3': {
                '0': {
                    '0': 'ACME Corporation'
                }
            }
        }
    }
}
```

## Empty string/null resource value handling for numeric and boolean types

You can choose the way to handle an empty string/null resource value by describing them in your `settings.js` or `RED.settings` objects.

- Empty string/null is translated into am empty string (`''`) and transmitted it to LwM2M server as an empty byte array (0-size packet). **This is default.** Set `''` to `emptyValue` property or omit the property.
- Empty string/null is translated into `0` for `INTEGER` and `FLOAT` types and `false` for `BOOLEAN` type. Set `auto` to `emptyValue` property.

Here's an example for providing the predefined manufacturer name.

`settings.js`
```
{
    lwm2m: {
        emptyValue: 'auto'
    }
}
```

## Debug output

You can enable `Observe`, `Read` and `Write` command debug log (stdout or `/var/log/syslog`) by setting logging level to `debug` at `logging.console.logging` in `settings.js`. For CANDY RED users, modify `CANDY_RED_LOG_LEVEL` in `$(npm -g root)/services/systemd/environment` file.

The example output is shown below.

```
Jul 24 03:13:38 raspberrypi start_systemd.sh[8524]: 24 Jul 03:13:38 - [debug] [lwm2m client:67a2f34a.15b424] [Observe] # of updated uris:3
Jul 24 03:13:38 raspberrypi start_systemd.sh[8524]: 24 Jul 03:13:38 - [debug] [lwm2m client:67a2f34a.15b424] <Read> uris=>^/3304/0/5700$, response=>[{"uri":"/3304/0/5700","value":{"type":"FLOAT","acl":"R","value":45.97}}]
Jul 24 03:13:38 raspberrypi start_systemd.sh[8524]: 24 Jul 03:13:38 - [debug] [lwm2m client:67a2f34a.15b424] <Read> uris=>^/3303/0/5700$, response=>[{"uri":"/3303/0/5700","value":{"type":"FLOAT","acl":"R","value":38.67}}]
```

## LwM2M Message Dump

With a new option `Dump LwM2M messages`, message hex dump is now available.
All messages between client and server are displayed in console (not the debug tab) as shown below when `Dump LwM2M messages` is checked.

```
Sending 51 bytes to [127.0.0.1]:5684
17 FE FD 00  01 00 00 00  00 00 10 00  26 00 01 00   ............&...
00 00 00 00  10 5C 30 F4  0D 78 00 25  1D 5D D5 AD   .....\0..x.%.]..
E8 64 32 F9  F0 7B A4 61  3A 15 AE C9  9B 2F CA 1C   .d2..{.a:..../..
D9 F4 3F                                             ..?

37 bytes received from [127.0.0.1]:5684
17 FE FD 00  01 00 00 00  00 00 10 00  18 00 01 00   ................
00 00 00 00  10 AC 42 8B  93 D2 E1 4E  40 6B F8 7F   ......B....N@k..
76 E5 AA 9E  85                                      v....
```

## Registration lifetime behavior

The lwm2m server is able to modify this client's lifetime with `Write` command to `Lifetime` resource in `Server Object`.
When the client detects the lifetime change, the interval between the registration update requests is updated as well at the coming registration update request. The client appends the lifetime query (`lt=<new lifetime>`) in the registration update request in order to notify the latest lifetime to the server.

## Embedded Mode Extensions

This node offers extra features for [embedded](https://nodered.org/docs/embedding) mode, which allows the host application to interact with this node via `EventEmitter` object named `internalEventBus` defined in `RED.settings` object.

However, this feature is **disabled** by default (opt-in). In order to enable it, ask users to check `Allow internal event propagation` property in `lwm2m` config node.

**Pseudo code:**

```
const EventEmitter = require('events').EventEmitter;
const RED = ...;
const server = ...;

const bus = new EventEmitter();
bus.on('object-event', (ev) => {
    // You can receive LwM2M object events here
    if (ev.eventType === 'updated') {
        ...
    }
});
// Create the settings object - see default settings.js file for other options
const settings = {
    ...
    lwm2m: {
        internalEventBus: bus, // set your own EventEmitter object
        objects : {
            '3': {
                '0': {
                    '0': "ACME Corporation"
                }
            },
            '99999': {
                '0': {
                    '0': 'ABCD'
                }
            }
        }
    },
    ...
};

RED.init(server, settings);
...

bus.emit('object-read', { id: '022eb56240784b43', topic: '/3/0/0' }); // 'Read' operation for retrieving Manufacturer
// Use a one-time listener (once)
bus.once('object-read-022eb56240784b43', (msg) => {
    if (/* boolean */ msg.error) {
        console.error(msg.payload); // error info
    } else {
        let man = msg.payload['/3/0/0'];
        ...
    }
});
```

# Supported OS

This node should work on Unix and Linux OS. Windows is not supported.

# Supported Node.js version

Node.js v8/10

# How to install

## Prebuilt Binaries

The prebuilt binaries are available for the following OS and architectures:

1. ARM(armv6+) Linux with Node.js 8/10 (For Raspberry Pi, ASUS tinker board and other ARMv6+ CPU computers)
1. x64 Linux with Node.js 8/10
1. macOS with Node.js 8/10

Other users need to install the following software manually:

1. GCC (4.8+)
1. make

## Node-RED users

Run the following commands:
```
cd ~/.node-red
npm install --production node-red-contrib-lwm2m
```

Then restart Node-RED process.

## CANDY RED users

Run the following commands:
```
cd /opt/candy-red/.node-red
sudo npm install --unsafe-perm --production node-red-contrib-lwm2m
```

Then restart `candy-red` service.

```
sudo systemctl restart candy-red
```

# Example Flows

You can import example flows available under `examples` folder on Node-RED UI.

# Appendix

## How to build from source

Install dependencies.

```
$ npm install
```

Then run the following commands to build source code.

```
# make configure  # Configure the build
$ make debugbuild # Build for Debug
$ make build      # Build for Release

$ make debug      # Rebuild for Debug
$ make verbose    # Rebuild with verbose logs for Release
```

In order to build JS code, run the following commands.

```
$ npm run build
```

## Eclipse Wakaama LwM2M Server

With [Wakaama LwM2M](https://github.com/eclipse/wakaama) Server, you can test this node on your localhost. The instruction for building the executable file is described [here](https://github.com/eclipse/wakaama#examples).

- Server Host: `localhost`
- Server Port: `5683` (DTLS is NOT supported)

Run the following command to start LwM2M Server to accept `localhost` address.

```
lwm2mserver -4
```

Enter `help` on the lwm2mserver console for supported commands.

## Eclipse Leshan Public Sandbox LwM2M Server with Web UI

Provide the following host and port for your lwm2m client config node to connect to Public [Leshan](https://github.com/eclipse/leshan) Server.

- Server Host: `leshan.eclipseprojects.io`
- Server Port: `5683` for plain UDP or `5684` for DTLS with checking `Enable DTLS`

You can manage your client info from the following URL.

https://leshan.eclipseprojects.io/#/clients

For Bootstrapping:
- Server Host: `leshan.eclipseprojects.io`
- Server Port: `5783` for plain UDP or `5784` for DTLS with checking `Enable DTLS`

You can create your bootstrapping info from the following URL.

https://leshan.eclipseprojects.io/bs/


# License

## Source Code License

Copyright (c) 2019 [CANDY LINE INC.](https://www.candy-line.io)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

# How to Release

1. Test all: `npm run test`
1. Publish NPM package: `npm publish`
1. Tag Release and Push
1. Checkout master: `git checkout master`
1. Publish binaries: `git commit --allow-empty -m "[publish binary]"`
1. Publish local binary (optional): `export NODE_PRE_GYP_GITHUB_TOKEN=... && make clean && make configure && make && make package && make publish`

# Revision History

* 2.2.1
  - Fix an issue where Resource#from failed to translate an object value into MULTIPLE_RESOURCE (Fix #14)

* 2.2.0
  - Fix an issue where wakatiwai client got halted because of the memory error (Fix #13)
  - Add the watchdog feature to monitor the wakatiwai client process
  - Add support for the lifetime change on registration update

* 2.1.3
  - Fix Device object ACL
  - Fix an issue where toString() failed to be invoked when val was null/undefined
  - Fix an issue where resource create/write commands didn't care of predefined object structure
  - Update wakatiwai client
      - Fix an issue where Create command added a new instance on error
      - Fix an issue where Delete command deleted an instance on error

* 2.1.2
  - Fix an issue where Bootstrap failed (Fix #10)
    - Fix an issue where Wakaama client rejected OPAQUE resource for server URI
  - Emits an error when PSK configuration is missing at deployment time (can be caught by Catch node)
  - Delete the provisioned configuration file immediately when `Save provisioned configuration` is disabled
  - Fix an issue where OPAQUE values for Integer/Float weren't translated into correct values
  - Fix an issue where the example flow failed to output `lwm2m` configuration node error
  - Show validation error when `enable DTLS` is checked and PSK identity/shared key are blank

* 2.1.1
  - Fix an issue where Bootstrap failed (Fix #10)
    - The root cause is Create command issue where that command with multiple targets wasn't performed correctly

* 2.1.0
  - Bump wakatiwai version to 2.0.3 (Fix #8)
  - Revert the default empty string/null resource value behavior for numeric/boolean types (Fix #9)
  - Introduce a new option to enable users to choose the default empty string/null resource value behavior for numeric/boolean types

* 2.0.2
  - Bump wakatiwai version to 2.0.2 (bugfix)

* 2.0.1
  - Bump wakatiwai version to 2.0.1 (memory leak issue fix)
  - Fix an issue where sourcemaps failed to generate source map files
  - Add support to start a new wakatiwai process under valgrind (debug use only)

* 2.0.0
  - Bump wakatiwai version to 2.0.0
  - LwM2M Bootstrap is supported (DTLS encryption with PSK or plain UDP)
  - Security Object, Server Object and ACL Object are now implemented in Javascript
  - Add a new option `Dump LwM2M messages` to dump LwM2M messages
  - Add a new option `Save provisioned configuration` to save provisioned information into a file through bootstrap
  - Object Backup/Restore commands are supported (issued by only Wakatiwai client)
  - Add the one-time listener support for `object-read`/`object-write`/`object-execute` result events
  - The resource value defined as a function is now evaluated whenever `Read` operation is performed
  - Return 404 error when there's no resource/object to `Delete`
  - Improve embedded mode integration

* 1.4.0
  - Update wakatiwai client as well as wakaama client
  - Fix an issue where bootstrap server host and port cannot be modified by the node configuration
  - Allow DTLS settings for bootstrapping as well
  - Add a way for a parent module to resolve the client name if necessary
  - Add a new property to turn on/off the LwM2M client

* 1.3.0
  - Update wakatiwai client as well as wakaama client
  - Fix an issue where the Write operation to a boolean object failed when non-`BOOLEAN` type value was provided (#5)
  - Fix an issue where Discover command to existing resources returned 5.00 (Internal Server Error) (#6)

* 1.2.2
  - Fix an issue where the shrinkwrap file contained devDependencies by default (a known npm3 bug)

* 1.2.1
  - Add a package lock file
  - Avoid to run git command unless .git directory exists while performing npm preinstall

* 1.2.0
  - Allow duplicate server host and port UNLESS client endpoint name is duplicate (#4)
  - Disallow duplicate client listening port
  - Fix an issue where client listening port parameter is ineffective
  - Fix an issue where reconnectSec property is missing in the example flow

* 1.1.0
  - Add a new option to configure the auto-reconnect interval in seconds
  - Fix an issue where object store operations may fail when the store isn't yet initialized at that time
  - Fix an issue where the promise was never resolved when isConenct is false
  - Suppress TinyDTLS warning logs

* 1.0.1
  - Suppress TinyDTLS debug logs
  - Update help text

* 1.0.0
  - General Availability

* 0.1.3
  - Initial Release (alpha)
  - `node-red` keyword is not yet added to package.json
