#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source $DIR/container_names.sh

CHECKPOINT_NAME="$1"

echo "Running checkpoint create script for $CHECKPOINT_NAME..."

docker commit -p "$ELASTICSEARCH_CONTAINER_NAME" "$ELASTICSEARCH_CONTAINER_NAME:dendro-tests_$CHECKPOINT_NAME"
docker commit -p "$VIRTUOSO_CONTAINER_NAME" "$VIRTUOSO_CONTAINER_NAME:dendro-tests_$CHECKPOINT_NAME"
docker commit -p "$MYSQL_CONTAINER_NAME" "$MYSQL_CONTAINER_NAME:dendro-tests_$CHECKPOINT_NAME"
docker commit -p "$MONGODB_CONTAINER_NAME" "$MONGODB_CONTAINER_NAME:dendro-tests_$CHECKPOINT_NAME"

echo "Checkpoint create script for checkpoint $CHECKPOINT_NAME finished."
