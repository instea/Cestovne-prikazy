#!/bin/bash
set -e

yarn
CI=true yarn test
yarn lint
cd angular
yarn
yarn test --config karma.ci.js
yarn lint
