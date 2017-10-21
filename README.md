Node-RED node for OMA LwM2M Client using Eclipse Wakaama
===

This node internally spawns a `wakatiwaiclient` process, which is a revised version of Eclipse Wakaama executable, and starts inter-process communication (IPC) over stdin and stdout. The `wakatiwaiclient` executable is slightly different from Wakaama's implementation, some of management objects are stripped. This node allows you to describe your own management objects on top of Node-RED.

When the parent process (i.e. Node-RED) exits, this node tries to emit a De-registration message to LwM2M server so that the server knows the client is gone.

This node restarts a new process when the child process is exited after a given interval time passes.

CoAP over DTLS is supported but disabled by default. Users are able to enable DTLS if necessary. However, supported security mechanism is only pre-shared key. RPK and X.509 are not supported.

Keep in mind that the inter-process communication over stdin/stdio is NOT encrypted and does NOT have any authentication mechanism. `ps` command allows you to show entire command line to start `wakatiwaiclient` including PSK Identity and PSK information.

The supported message format is `TLV` rather than `JSON`.

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

## Supported LwM2M operations

- `read`
- `write`
- `execute`
- `observe`
- `discover`
- ~~`create`~~ (TBD)
- ~~`delete`~~ (TBD)

† ACL Object management will be implemented on `create` and `delete` operation support

† Bootstrap is not yet tested

## Predefined Objects

The following objects are implemented in C (Using Wakaama example).

- `Security Object`
- `Server Object`

## Bundled Objects

The following objects are implemented in Javascript. They can be overlaid with user defined object JSON (see below).

- `Access Control Object`
- `Device Object`

Security Notice) The project depends on [`systeminformation`](https://www.npmjs.com/package/systeminformation) package to collect system information. This package is excellent but it can expose sensitive information like serial number, device model and OS version to a LwM2M server. In order to avoid unexpected exposure to a public sandbox server, `Hide Sensitive Device Info` property is enabled by default. So you need to uncheck it prior to sending entire device information from the node.

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
- `OPAQUE` ... Byte Array
- `INTEGER` ... 64bit integer
- `FLOAT` ... double
- `BOOLEAN` ... boolean
- `OBJECT_LINK` ... Object Link
- `MULTIPLE_RESOURCE` ... Resource Array
- `FUNCTION` ... This is NOT a LwM2M Resource Type. Used for defining `execute` operation Resource

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
            '0': {
                '0': {
                    '0': "ACME Corporation"
                }
            }
        }
    }
}
```

# Supported OS

This node should work on Unix and Linux OS. Windows is not supported.

# Supported Node.js version

Node.js v4+

# How to install

## Node-RED users

Run the following commands:
```
cd ~/.node-red
sudo npm install node-red-contrib-lwm2m
```

Then restart Node-RED process.

## CANDY RED users

Run the following commands:
```
cd $(npm -g root)/candy-red
sudo npm install node-red-contrib-lwm2m
```

Then restart `candy-red` service.

```
sudo systemctl restart candy-red
```

# Example Flows

You can import example flows available under `examples` folder on Node-RED UI.

# Appendix

## How to build from source

Clone dependencies.

```
# clone submodules (wakaama and tinydtls)
$ git submodule update --init --recursive
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

## Eclipse Leshan Public Sandbox LwM2M Server with Web UI

Provide the following host and port for your lwm2m client config node to connect to Public Leshan Server.

- Server Host: `leshan.eclipse.org`
- Server Port: `5683` for plain UDP or `5684` for DTLS with checking `Enable DTLS`

You can also review your client status from the following URL.

http://leshan.eclipse.org/#/clients

# License

## Source Code License

Copyright (c) 2017 CANDY LINE INC.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

# Revision History

* 0.1.0
  - Initial Release (alpha)
  - `node-red` keyword is not yet added
