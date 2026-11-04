#!/bin/bash
set -e

node -v

yarn
CI=true yarn test
yarn lint
cd angular
yarn
yarn test --config karma.ci.js
yarn lint
