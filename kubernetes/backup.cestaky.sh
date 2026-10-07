#!/bin/sh
#
# Backup DB from mongo running in k8s

set -ex

#=====================================================================
# Set the following variables as per your requirement
#=====================================================================
# Pod app label
POD_LABEL="mongo3"
# Mongo config
MONGO_DATABASE="cestaky"
# Database user name
DBUSERNAME="mongoadmin"
# Database password
DBPASSWORD="32VXP7xNPU2xz453"
# Authentication database name
DBAUTHDB="admin"
# Backup directory
BACKUPS_DIR="/opt/instea/backup/mongo/dumps/$POD_LABEL"
# Days to keep the backup
DAYSTORETAINBACKUP="14"
#=====================================================================

TIMESTAMP=`date +%F-%H%M`
BACKUP_NAME="$MONGO_DATABASE-$TIMESTAMP"

echo "Performing backup of $POD_LABEL"
echo "--------------------------------------------"
# Create backup directory
if ! mkdir -p $BACKUPS_DIR; then
  echo "Can't create backup directory in $BACKUPS_DIR. Go and fix it!" 1>&2
  exit 1;
fi;
# Create dump
POD=$(microk8s kubectl get pod -l app=$POD_LABEL -o jsonpath="{.items[0].metadata.name}")
# use different filename than for restores to avoid permission problems
microk8s kubectl exec $POD -- bash -c "mongodump --db $MONGO_DATABASE --username $DBUSERNAME --password $DBPASSWORD --authenticationDatabase $DBAUTHDB --gzip --archive=/tmp/mongo1.dump.gz"
microk8s kubectl cp $POD:/tmp/mongo1.dump.gz dump.gz
# Rename dump file to backup name
mv dump.gz $BACKUPS_DIR/$BACKUP_NAME.gz
# Delete backups older than retention period
find $BACKUPS_DIR -type f -mtime +$DAYSTORETAINBACKUP -exec rm {} +
echo "--------------------------------------------"
echo "Database backup complete!"
