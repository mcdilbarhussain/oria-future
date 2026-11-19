#!/bin/sh
# Runs inside the "backup" container: nightly pg_dump + uploads archive at 02:30 UTC.
# Retention: files in /backups older than RETENTION_DAYS are pruned.
while true; do
  if [ "$(date -u +%H%M)" = "0230" ]; then
    ts=$(date -u +%Y%m%d-%H%M)
    pg_dump -h "${DATABASE_HOST:-db}" -U oria -Fc oria_erp > "/backups/oria-$ts.dump"
    tar czf "/backups/uploads-$ts.tgz" -C /uploads .
    find /backups -name 'oria-*.dump' -mtime +"${RETENTION_DAYS:-14}" -exec rm -f {} \;
    find /backups -name 'uploads-*.tgz' -mtime +"${RETENTION_DAYS:-14}" -exec rm -f {} \;
    echo "backup $ts done"
    sleep 60
  fi
  sleep 30
done
