#!/bin/bash
yarn
CI=true yarn test
RES=$?
if [ $RES -ne 0 ]
then
  exit $RES
fi
yarn lint
RES=$?
if [ $RES -ne 0 ]
then
  exit $RES
fi
cd angular
yarn
yarn test --config karma.ci.js
RES=$?
if [ $RES -ne 0 ]
then
  exit $RES
fi
yarn lint
RES=$?
if [ $RES -ne 0 ]
then
  exit $RES
fi
