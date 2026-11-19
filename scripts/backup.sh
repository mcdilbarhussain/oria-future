#!/usr/bin/env bash
# Manual / cron backup for non-Docker installs.
#   DATABASE_URL=postgresql://... ./scripts/backup.sh /var/backups/oria
# Restore:
#   pg_restore --clean --if-exists -d "$DATABASE_URL" oria-<timestamp>.dump
set -euo pipefail
DEST="${1:-./backups}"
mkdir -p "$DEST"
TS=$(date -u +%Y%m%d-%H%M)
pg_dump "${DATABASE_URL%%\?*}" -Fc -f "$DEST/oria-$TS.dump"
tar czf "$DEST/uploads-$TS.tgz" -C "${STORAGE_DIR:-./storage/uploads}" .
echo "Backup written to $DEST (oria-$TS.dump, uploads-$TS.tgz)"
echo "Tip: prune old backups with your cron, e.g. find $DEST -name 'oria-*.dump' -mtime +14"
