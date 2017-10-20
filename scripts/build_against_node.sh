#!/usr/bin/env bash

source ./__nvm/nvm.sh

set -e -u

PATH=${PATH}:./node_modules/.bin

function publish() {
    if [[ ${PUBLISHABLE:-false} == true ]] && [[ ${COMMIT_MESSAGE} =~ "[publish binary]" ]]; then
        node-pre-gyp package testpackage --target_arch=${ARCH}
        node-pre-gyp-github publish --target_arch=${ARCH} --release
        node-pre-gyp info --target_arch=${ARCH}
        make clean
    fi
}

# test installing from source
if [[ ${COVERAGE} == true ]]; then
    CXXFLAGS="--coverage" LDFLAGS="--coverage" npm install --build-from-source
    npm test
    ./py-local/bin/cpp-coveralls --exclude node_modules --exclude tests --build-root build --gcov-options '\-lp' --exclude docs --exclude build/Release/obj/gen --exclude deps  > /dev/null
else
    npm install --build-from-source
    npm test
fi


publish
