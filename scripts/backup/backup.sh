#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly backup_root=/backups state_root=/backup-state
readonly schedule_file=$state_root/last-successful-start
readonly interval=${BACKUP_INTERVAL_SECONDS:-86400} retry=${BACKUP_RETRY_SECONDS:-300}

log() {
    printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >&2
}

fail() {
    log "$*"
    exit 1
}

next_due() {
    local last_start=0
    if [[ -f $schedule_file ]]; then
        read -r last_start < "$schedule_file"
        [[ $last_start =~ ^[0-9]{1,12}$ ]] || return 1
    fi
    printf '%s\n' "$((10#$last_start + interval))"
}

cleanup() {
    if [[ -n ${work_dir:-} ]]; then rm -rf -- "$work_dir"; fi
    if [[ -n ${stage_dir:-} ]]; then rm -rf -- "$stage_dir"; fi
}

write_mysql_config() {
    local password=$MYSQL_ROOT_PASSWORD
    password=${password//\\/\\\\}
    password=${password//\"/\\\"}
    password=${password//$'\n'/\\n}
    password=${password//$'\r'/\\r}
    password=${password//$'\t'/\\t}
    printf '[client]\nuser=root\npassword="%s"\n' "$password" > "$work_dir/mysql.cnf"
}

s3() {
    AWS_ACCESS_KEY_ID=$MINIO_ROOT_USER AWS_SECRET_ACCESS_KEY=$MINIO_ROOT_PASSWORD \
        AWS_DEFAULT_REGION=$S3_REGION AWS_EC2_METADATA_DISABLED=true \
        AWS_CONFIG_FILE=$work_dir/aws-config \
        aws --no-cli-pager --endpoint-url http://minio:9000 "$@"
}

capture() {
    local trigger=$1 started stamp due target
    : "${MYSQL_ROOT_PASSWORD:?}" "${MYSQL_DATABASE:?}" "${MINIO_ROOT_USER:?}" \
        "${MINIO_ROOT_PASSWORD:?}" "${S3_BUCKET:?}" "${S3_REGION:?}"

    exec 9> "$state_root/backup.lock"
    flock -n 9 || fail 'A backup is already running.'
    started=$(date -u +%s)
    if [[ $trigger == scheduled ]]; then
        due=$(next_due) || fail 'Could not read the backup schedule.'
        if ((started < due)); then return 0; fi
    fi

    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    stamp=$(date -u -d "@$started" +%Y%m%dT%H%M%SZ)
    work_dir=$(mktemp -d) || fail 'Could not create the temporary workspace.'
    stage_dir=$(mktemp -d "$backup_root/.valetudo-$stamp-XXXXXXXX") || fail 'Could not write to the backup directory.'
    target=$backup_root/${stage_dir##*/.}

    log '[1/3] Exporting MySQL'
    write_mysql_config
    if ! mysqldump --defaults-file="$work_dir/mysql.cnf" --host=mysql --protocol=TCP \
        --single-transaction --quick --hex-blob --no-tablespaces --set-gtid-purged=OFF \
        --routines --events --triggers --default-character-set=utf8mb4 \
        --databases -- "$MYSQL_DATABASE" > "$work_dir/mysql.sql" 2>/dev/null; then
        fail 'MySQL export failed. Check service readiness, database name, and credentials.'
    fi
    [[ -s $work_dir/mysql.sql ]] || fail 'MySQL returned an empty dump.'

    log '[2/3] Copying current MinIO objects'
    printf '[default]\ns3 =\n    addressing_style = path\n' > "$work_dir/aws-config"
    mkdir "$work_dir/minio"
    if ! s3 s3api head-bucket --bucket "$S3_BUCKET" >/dev/null 2>&1; then
        fail 'MinIO bucket check failed. Check service readiness, bucket name, and credentials.'
    fi
    if ! s3 s3 sync "s3://$S3_BUCKET/" "$work_dir/minio/" --only-show-errors >/dev/null 2>&1; then
        fail 'MinIO object copy failed.'
    fi

    log '[3/3] Packaging and verifying the backup'
    printf 'format=1\nstarted_utc=%s\nfinished_utc=%s\ntrigger=%s\ndatabase=%s\nbucket=%s\n' \
        "$(date -u -d "@$started" +%FT%TZ)" "$(date -u +%FT%TZ)" "$trigger" "$MYSQL_DATABASE" "$S3_BUCKET" \
        > "$work_dir/manifest.txt"
    if ! tar -czf "$stage_dir/valetudo-backup.tar.gz" -C "$work_dir" mysql.sql minio manifest.txt \
        || ! tar -tzf "$stage_dir/valetudo-backup.tar.gz" >/dev/null \
        || ! (cd "$stage_dir" && sha256sum valetudo-backup.tar.gz > SHA256SUMS); then
        fail 'Archive creation or verification failed.'
    fi

    mv -T -- "$stage_dir" "$target" || fail 'Could not publish the archive.'
    stage_dir=
    log "Backup complete. ${target##*/}/valetudo-backup.tar.gz"
    if [[ $trigger == scheduled ]]; then
        printf '%s\n' "$started" > "$schedule_file.tmp"
        mv -T -- "$schedule_file.tmp" "$schedule_file"
    fi
}

stop_scheduler() {
    if [[ -n ${child:-} ]]; then
        kill -TERM "$child" 2>/dev/null || true
        wait "$child" || true
    fi
    exit 0
}

wait_for_child() {
    "$@" &
    child=$!
    local status=0
    wait "$child" || status=$?
    child=
    return "$status"
}

schedule() {
    local now due announced_due=0
    trap stop_scheduler INT TERM
    while true; do
        now=$(date -u +%s)
        due=$(next_due) || fail 'Could not read the backup schedule.'
        if ((now < due)); then
            if ((announced_due != due)); then
                log "Next scheduled backup $(date -u -d "@$due" +%FT%TZ)"
                announced_due=$due
            fi
            # Recheck the wall clock after host sleep or a clock adjustment.
            wait_for_child sleep "$((due - now < 60 ? due - now : 60))"
        elif ! wait_for_child "$0" scheduled; then
            log "Scheduled backup failed. Retrying in $retry seconds."
            wait_for_child sleep "$retry"
        fi
    done
}

[[ $interval =~ ^[1-9][0-9]{0,8}$ && $retry =~ ^[1-9][0-9]{0,8}$ ]] || fail 'Backup intervals must be positive whole seconds.'
case ${1:-schedule} in
    schedule) schedule ;;
    once) capture manual ;;
    scheduled) capture scheduled ;;
    *) fail 'Usage: healthlink-backup [schedule|once]' ;;
esac
