#!/bin/bash
set -e

export NVM_DIR=$HOME/.nvm
source $NVM_DIR/nvm.sh
nvm use 8
node -v

yarn
CI=true yarn test
yarn lint
cd angular
yarn
yarn test --config karma.ci.js
yarn lint
