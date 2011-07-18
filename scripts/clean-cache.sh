#!/bin/sh
# Cron script: Delete all files in the cache that have expired.
# By default, this script is supposed to live in the directory that contains
# the cache/ directory.

AJAX_CACHE_DIR="$(dirname "$0")/cache"

find "$AJAX_CACHE_DIR" -type f -mtime +1 -delete
