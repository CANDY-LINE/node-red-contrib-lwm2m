# Revision History

* 2.10.0
  - Add a new feature for terminating the running LwM2M client with messages

* 2.9.1
  - Fix #23 (Failed to start the node with LazyStart=true)

* 2.9.0
  - Add a new option for `lazyStart` in lwm2m config node
  - Add a new event `clientStateChanged` to propagate the state change of the lwm2m client

* 2.8.0
  - Add a new option to set `outputAsObject` property in lwm2m in node
  - Add object format output support
  - Include the topic to the output message
  - Avoid possible undefined error

* 2.7.0
  - Add a missing parameter to be configured in embedded mode
  - Update wakatiwai client (bug fix)

* 2.6.0
  - Add support for Node.js v12
  - Drop support for Node.js v8
  - Add a new parameter to provide bootstrap interval in seconds

* 2.5.0
  - Add a notice for Node.js v8 support termination on README
  - Improve node configuration dialog behavior
  - Fix a possible error on translating into Buffer
  - Increase the minimum value of the maximum receivable packet size to 16.1KiB
  - Update wakatiwai client
    - Increase the max size of Block1 Transfer receivable resource size (from 4KiB to 1MiB)
    - Increase the Block1 Transfer acceptable chunk size (from 128 bytes to 16KiB)
    - New message format support for transferring the large data to this node

* 2.4.0
  - Add a new option to configure the maximum receivable packet size on a lwm2m client(wakatiwai). Use this option to extend the packet size. The lwm2m client always discards the packet sent from a LwM2M server when its size is larger than the default packet size (1024).
  - Update wakatiwai client (see above for detail)

* 2.3.0
  - Add new parameters for `backedUp` and `restored` events
  - Strip the cleaner property as backup objects should be retained while the current flow is alive
  - Skip event propagation setup when the node config is disabled
  - Add clientName variable to duplicate client port error message
  - Fix an issue where clientPort was assigned to the default port if n.clientPort was 0 rather than undefined/null
  - Update wakatiwai client
    - Fix an issue where connecting to the same server always failed after re-bootstrapping

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
