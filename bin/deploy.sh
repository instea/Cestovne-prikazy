#!/bin/bash

# Variables
MONGO_URL=mongodb://localhost:27017/cestaky

pushd "$(dirname $0)/.."
MONGO_URL=$MONGO_URL npm run server
