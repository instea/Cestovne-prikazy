#! /bin/bash
#
# Restores mongo running in K8S
# See https://docs.mongodb.com/database-tools/mongorestore/#behavior for more details (especially `insert only` section)
# if you want to overwrite, check --drop option
set -ex

USERNAME=mongoadmin
PASS=32VXP7xNPU2xz453
# Authentication database name
DBAUTHDB="admin"
# what is the original DB in backup
ORIGINAL_DB=cestaky
# Database where to restore to (might be the same if it is new mongo instance)
RESTORE_DB=cestaky-restore
DUMP_TO_RESTORE=dump.gz

K_CMD=microk8s.kubectl

POD=$($K_CMD get pod -l app=mongo3 -o jsonpath="{.items[0].metadata.name}")
echo Selected $POD
$K_CMD cp $DUMP_TO_RESTORE $POD:/tmp/mongo.dump.gz 
$K_CMD exec $POD -- bash -c "mongorestore --username $USERNAME --password $PASS --nsFrom "$ORIGINAL_DB.*" --nsTo "$RESTORE_DB.*" --authenticationDatabase $DBAUTHDB --gzip --archive=/tmp/mongo.dump.gz"
