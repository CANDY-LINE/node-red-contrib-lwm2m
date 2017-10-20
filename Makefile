#http://www.gnu.org/prep/standards/html_node/Standard-Targets.html#Standard-Targets
ARCH ?= $(shell node -e 'console.log(require("os").arch())')

all: build

./node_modules:
	npm install --build-from-source

configure: ./node_modules
	./node_modules/.bin/node-pre-gyp configure --target_arch=$(ARCH)

build: ./node_modules
	./node_modules/.bin/node-pre-gyp build --loglevel=silent --target_arch=$(ARCH)

debug:
	./node_modules/.bin/node-pre-gyp rebuild --debug --target_arch=$(ARCH)

debugbuild:
	./node_modules/.bin/node-pre-gyp build --debug --target_arch=$(ARCH)

verbose:
	./node_modules/.bin/node-pre-gyp rebuild --loglevel=verbose --target_arch=$(ARCH)

clean:
	@rm -rf ./build
	rm -rf lib/binding/
#	rm -rf ./node_modules/

grind:
	valgrind --leak-check=full node node_modules/.bin/_mocha

testpack:
	rm -f ./*tgz
	npm pack
	tar -ztvf *tgz
	rm -f ./*tgz

rebuild:
	@make clean
	@make configure
	@make

package:
	./node_modules/.bin/node-pre-gyp package testpackage --target_arch=$(ARCH)

publish:
	./node_modules/.bin/node-pre-gyp-github publish --release

ifndef only
test:
	@PATH="./node_modules/mocha/bin:${PATH}" && NODE_PATH="./lib:$(NODE_PATH)" mocha -R spec
else
test:
	@PATH="./node_modules/mocha/bin:${PATH}" && NODE_PATH="./lib:$(NODE_PATH)" mocha -R spec test/${only}.test.js
endif

check: test

.PHONY: test clean build configure debug debugbuild package publish
