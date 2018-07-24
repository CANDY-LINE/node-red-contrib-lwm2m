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

Keep in mind that the inter-process communication over stdin/stdio is **NOT** encrypted and does **NOT** have any authentication mechanism. `ps` command allows users to show entire command line to start [`wakatiwaiclient`](https://github.com/CANDY-LINE/wakatiwai) including PSK Identity and PSK information.

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
- ~~`create`~~ (TBD)
- ~~`delete`~~ (TBD)

† ACL Object management will be implemented on `create` and `delete` operation support

† Bootstrap isn't fully supported (should work but retrieving the provisioned information from the node isn't yet implemented)

## Predefined Objects

The following objects are implemented in C (Using [Wakaama](https://github.com/eclipse/wakaama)'s "AS IS" example).

- `Security Object`
- `Server Object`

## Bundled Objects

The following objects are implemented in Javascript. They can be overlaid with user defined object JSON (see below).

- `Access Control Object`
- `Device Object`

Security Notice) The project depends on [`systeminformation`](https://www.npmjs.com/package/systeminformation) package to collect system information. This package is excellent but it can expose sensitive information like serial number, device model and OS version to a LwM2M server. In order to avoid unexpected exposure to a public sandbox server, `Hide Sensitive Device Info` property is checked by default. So you need to uncheck it prior to sending entire device information from the node.

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

## Preserved global predefined objects

You can add your own systemwide custom objects by describing them in your `settings.js` or `RED.settings` objects. These objects are **preserved** and **never overwritten** by user's configuration node.

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

## Debug output

You can enable `Observe`, `Read` and `Write` command debug log (stdout or `/var/log/syslog`) by setting logging level to `debug` at `logging.console.logging` in `settings.js`. For CANDY RED users, modify `CANDY_RED_LOG_LEVEL` in `$(npm -g root)/services/systemd/environment` file.

The example output is shown below.

```
Jul 24 03:13:38 raspberrypi start_systemd.sh[8524]: 24 Jul 03:13:38 - [debug] [lwm2m client:67a2f34a.15b424] [Observe] # of updated uris:3
Jul 24 03:13:38 raspberrypi start_systemd.sh[8524]: 24 Jul 03:13:38 - [debug] [lwm2m client:67a2f34a.15b424] <Read> uris=>^/3304/0/5700$, response=>[{"uri":"/3304/0/5700","value":{"type":"FLOAT","acl":"R","value":45.97}}]
Jul 24 03:13:38 raspberrypi start_systemd.sh[8524]: 24 Jul 03:13:38 - [debug] [lwm2m client:67a2f34a.15b424] <Read> uris=>^/3303/0/5700$, response=>[{"uri":"/3303/0/5700","value":{"type":"FLOAT","acl":"R","value":38.67}}]
```

## Embedded Mode Extensions

This node offers extra features for [embedded](https://nodered.org/docs/embedding) mode, which allows the host application to interact with this node via `EventEmitter` object named `internalEventBus` defined in `RED.settings` object.

However, this feature is **disabled** by default (opt-in). In order to enable it, ask users to check `Allow Internal Event Propagation` property in `lwm2m` config node.

**Pseudo code:**

```
const EventEmitter = require('events').EventEmitter;
const RED = ...;
let server = ...;

let bus = new EventEmitter();
bus.on('object-event', (ev) => {
    // You can receive LwM2M object events here
    if (ev.eventType === 'updated') {
        ...
    }
});
// Create the settings object - see default settings.js file for other options
let settings = {
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

bus.emit('object-read', { id: 123, topic: '/3/0/0' }); // 'Read' operation for retrieving Manufacturer
bus.once('object-result', (msg) => {
    if (msg.id === 123) {
        if (/* boolean */ msg.error) {
            console.error(msg.payload); // error info
        } else {
            let man = msg.payload['/3/0/0'];
            ...
        }
    }
});
```

# Supported OS

This node should work on Unix and Linux OS. Windows is not supported.

# Supported Node.js version

Node.js v6+

# How to install

## Prebuilt Binaries

The prebuilt binaries are available for the following OS and architectures:

1. ARM(armv6+) Linux with Node.js 6/7/8 (For Raspberry Pi, ASUS tinker board and other ARMv6+ CPU computers)
1. x64 Linux with Node.js 6/8
1. macOS with Node.js 6

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

# TODOs

- `create` operation support
- `delete` operation support
- Bootstrapping support (partially supported so far)

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

- Server Host: `leshan.eclipse.org`
- Server Port: `5683` for plain UDP or `5684` for DTLS with checking `Enable DTLS`

You can also review your client status from the following URL.

http://leshan.eclipse.org/#/clients

# License

## Source Code License

Copyright (c) 2018 [CANDY LINE INC.](https://www.candy-line.io)

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
1. Tag Release and Push
1. Checkout master: `git checkout master`
1. Install devDependencies: `npm install -dev`
1. Revert shrinkwrap file changes: `npm run postinstall`
1. Publish NPM package: `npm publish`
1. Publish binaries: `git commit --allow-empty -m "[publish binary]"`
1. Publish local binary (optional): `export NODE_PRE_GYP_GITHUB_TOKEN=... && make package && make publish`

# Revision History
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
