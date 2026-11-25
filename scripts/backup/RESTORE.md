# Verify and restore a HealthLink backup

Use synthetic data for rehearsals. Restore into fresh services with their own storage, then verify the recovered records and objects before using the same archive for recovery. The archive covers the HealthLink database and the current MinIO file contents. Provision database accounts and bucket settings on the destination separately.

## Check the archive

From the repository root, set `$snapshot` to the completed backup directory. Verify the checksum and read the source database and bucket names from the manifest.

```powershell
$snapshot = (Resolve-Path './backups/<timestamped-folder>').Path
$archiveMount = "type=bind,source=$snapshot,target=/snapshot,readonly"
docker run --rm --mount $archiveMount --entrypoint bash valetudo-healthlink-backup:local -ec 'cd /snapshot; sha256sum -c SHA256SUMS; tar -xOf valetudo-backup.tar.gz manifest.txt'
```

Expect `valetudo-backup.tar.gz: OK`. Use the database and bucket names from the manifest in the restore command.

## Rehearse the restore in fresh containers

Start the two disposable services on their own network. The fixed passwords in this example are for the rehearsal.

```powershell
docker network create healthlink-rehearsal
docker run -d --rm --name healthlink-rehearsal-mysql --network healthlink-rehearsal --network-alias mysql -p 127.0.0.1:43307:3306 -e MYSQL_ROOT_PASSWORD=rehearsal-mysql-only mysql:8.0
docker run -d --rm --name healthlink-rehearsal-minio --network healthlink-rehearsal --network-alias minio -p 127.0.0.1:49000:9000 -e MINIO_ROOT_USER=rehearsal -e MINIO_ROOT_PASSWORD=rehearsal-minio-only cgr.dev/chainguard/minio:latest server /data
```

Wait for both services to accept connections. In MySQL's logs, look for the final `ready for connections` entry on port 3306. Check MinIO at `http://127.0.0.1:49000/minio/health/ready`. Then import the SQL dump, upload the files, and check the restored contents.

```powershell
docker run --rm --network healthlink-rehearsal --mount $archiveMount --entrypoint bash `
  -e MYSQL_PWD=rehearsal-mysql-only -e AWS_ACCESS_KEY_ID=rehearsal -e AWS_SECRET_ACCESS_KEY=rehearsal-minio-only `
  -e AWS_DEFAULT_REGION=us-east-1 -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required `
  -e RESTORE_DATABASE=valetudo_healthlink -e RESTORE_BUCKET=valetudo-attachments `
  valetudo-healthlink-backup:local -euo pipefail -c '
    cd /snapshot
    sha256sum -c SHA256SUMS
    tar -xOf valetudo-backup.tar.gz mysql.sql | mysql --host=mysql --user=root
    mysql --host=mysql --user=root --database="$RESTORE_DATABASE" --execute="SELECT COUNT(*) AS users FROM USERS; SELECT COUNT(*) AS encounters FROM EMR_RECORDS; SELECT COUNT(*) AS attachments FROM EMR_ATTACHMENTS;"
    mkdir /tmp/restore
    tar -xzf valetudo-backup.tar.gz -C /tmp/restore minio
    aws configure set default.s3.addressing_style path
    aws --endpoint-url http://minio:9000 s3 mb "s3://$RESTORE_BUCKET"
    aws --endpoint-url http://minio:9000 s3 sync /tmp/restore/minio/ "s3://$RESTORE_BUCKET/" --only-show-errors
    (cd /tmp/restore/minio && find . -type f -exec sha256sum -- {} +) > /tmp/restore/file-checksums
    if [[ -s /tmp/restore/file-checksums ]]; then
      mkdir /tmp/restored-files
      aws --endpoint-url http://minio:9000 s3 sync "s3://$RESTORE_BUCKET/" /tmp/restored-files/ --only-show-errors
      (cd /tmp/restored-files && sha256sum --check --quiet /tmp/restore/file-checksums)
    fi
  '
```

Compare the MySQL counts with what you expect from the backup. The checksum check reads the restored MinIO files back and compares their bytes with the archive. To check that HealthLink can read the recovered data, point a rehearsal API at these services, configure the source `ENCRYPTION_KEY` and `ENCRYPTION_SALT`, and open a known encounter and its attachment.

When finished, remove the disposable services and their network.

```powershell
docker stop healthlink-rehearsal-minio healthlink-rehearsal-mysql
docker network rm healthlink-rehearsal
```
