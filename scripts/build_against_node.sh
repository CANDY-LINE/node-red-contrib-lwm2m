#!/usr/bin/env bash

source ./__nvm/nvm.sh

set -e -u

PATH=${PATH}:./node_modules/.bin
COMMIT_MESSAGE=$(cat ./.commit_message)

if [[ $(uname -s) == 'Linux' ]]; then
  export PYTHONPATH=$(pwd)/py-local/lib/python2.7/site-packages;
else
  export PYTHONPATH=$(pwd)/py-local/lib/python/site-packages;
fi;

if [[ ${COVERAGE} == true ]]; then
  if [[ $(uname -s) == 'Linux' ]]; then
    PYTHONUSERBASE=$(pwd)/py-local pip install --user cpp-coveralls;
  else
    PYTHONUSERBASE=$(pwd)/py-local easy_install --user cpp-coveralls;
  fi;
fi

function publish() {
    if [[ ${PUBLISHABLE:-false} == true ]] && [[ ${COMMIT_MESSAGE} =~ "[publish binary]" ]]; then
        make package ARCH=${ARCH}
        make publish
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
