node-red-contrib-lwm2m
===

Node-RED nodes for OMA LwM2M using Eclipse Wakaama

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
# make configure # Configure the build
$ make debug     # Debug build
$ make verbose   # Release build with verbose logs
$ make build     # Release build
```

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

## Eclipse Wakaama License

Eclipse Wakaama is available under EPL v1.0 and EDL v1.0.

## Eclipse tinydtls License

Eclipse tinydtls is available under EPL v1.0 and EDL v1.0.

# Revision History

* 0.1.0
  - Initial Release (alpha)
  - `node-red` keyword is not yet added
