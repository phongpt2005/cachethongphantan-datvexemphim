#!/bin/bash
# ==============================================================================
# Entrypoint cho một nút trong cụm PostgreSQL + repmgr.
#
#   NODE_ROLE=data     nút dữ liệu. Lần đầu: INITIAL_ROLE=primary -> initdb;
#                      INITIAL_ROLE=standby -> clone từ Primary hiện tại.
#                      Khởi động lại sau failover: thấy đã có Primary khác
#                      -> tự pg_rewind và quay lại làm Standby (chống 2 Primary).
#                      Đang chạy làm Primary mà thấy nút khác là Primary với timeline
#                      cao hơn (mình từng bị cô lập) -> tự dừng để khởi động lại làm Standby.
#   NODE_ROLE=witness  trọng tài bỏ phiếu (Node 3): không chứa dữ liệu nghiệp vụ,
#                      giúp Standby phân biệt "Primary chết" với "đứt mạng".
#
# Quy tắc thăng cấp (repmgrd): Standby chỉ lên Primary khi thấy ĐA SỐ nút (2/3) và
# không nút nào còn thấy Primary cũ (primary_visibility_consensus).
#
# Biến môi trường: NODE_ID, NODE_NAME, LOCATION, PRIORITY,
#   ADVERTISE_HOST/ADVERTISE_PORT (địa chỉ các máy khác dùng để gọi nút này),
#   PEERS="host:port,host:port" (các nút dữ liệu khác), POSTGRES_PASSWORD, REPMGR_PASSWORD
# ==============================================================================
set -euo pipefail

: "${NODE_ROLE:=data}" "${INITIAL_ROLE:=standby}" "${PRIORITY:=100}" "${LOCATION:=lan}"
: "${REPMGR_PASSWORD:=repmgr_pass_2026}" "${PEERS:=}"
export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
CONF=/etc/repmgr.conf
BIN=/usr/lib/postgresql/15/bin
PG_OPTS=(-c shared_preload_libraries=repmgr -c wal_level=replica -c wal_log_hints=on
         -c max_wal_senders=10 -c max_replication_slots=10 -c hot_standby=on
         -c wal_keep_size=256MB -c listen_addresses=* -c hba_file=/etc/postgresql/pg_hba.conf)

log() { echo "[cluster:${NODE_NAME}] $*" >&2; }
as_pg() { gosu postgres "$@"; }
peer_conninfo() { echo "host=${1%%:*} port=${1##*:} user=repmgr dbname=repmgr password=${REPMGR_PASSWORD} connect_timeout=2"; }

# Trả về host:port của nút đang là PRIMARY trong PEERS (rỗng nếu không thấy)
find_peer_primary() {
  local p
  IFS=',' read -ra list <<< "$PEERS"
  for p in "${list[@]}"; do
    [ -z "$p" ] && continue
    if [ "$(psql "$(peer_conninfo "$p")" -tAc 'select not pg_is_in_recovery()' 2>/dev/null)" = "t" ]; then
      echo "$p"; return 0
    fi
  done
  return 1
}

wait_peer_primary() {
  local p
  until p=$(find_peer_primary); do log "chờ Primary trong [$PEERS]..."; sleep 2; done
  echo "$p"
}

write_repmgr_conf() {
  cat > "$CONF" <<EOF
node_id=${NODE_ID}
node_name='${NODE_NAME}'
conninfo='host=${ADVERTISE_HOST} port=${ADVERTISE_PORT} user=repmgr dbname=repmgr password=${REPMGR_PASSWORD} connect_timeout=2'
data_directory='${PGDATA}'
pg_bindir='${BIN}'
location='${LOCATION}'
priority=${PRIORITY}
failover='automatic'
primary_visibility_consensus=true
promote_command='/usr/bin/repmgr standby promote -f ${CONF} --log-to-file'
follow_command='/usr/bin/repmgr standby follow -f ${CONF} --log-to-file --upstream-node-id=%n'
monitor_interval_secs=2
reconnect_attempts=3
reconnect_interval=2
connection_check_type='ping'
# Sau một lần bầu chọn bị huỷ, repmgrd đứng ở "degraded monitoring" và không bầu lại nữa.
# Cho nó thoát sau 20 s để vòng giám sát bên dưới khởi động lại -> đánh giá lại từ đầu.
degraded_monitoring_timeout=20
log_level='INFO'
EOF
  chown postgres:postgres "$CONF"
}

# Script initdb: tạo user/db cho repmgr (chỉ chạy khi thư mục dữ liệu còn trống)
write_initdb_script() {
  mkdir -p /docker-entrypoint-initdb.d
  cat > /docker-entrypoint-initdb.d/10-repmgr.sh <<EOF
#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 -U postgres <<SQL
CREATE ROLE repmgr WITH SUPERUSER REPLICATION LOGIN PASSWORD '${REPMGR_PASSWORD}';
CREATE DATABASE repmgr OWNER repmgr;
SQL
EOF
}

PG_PID=""
start_postgres() {
  if [ -s "$PGDATA/PG_VERSION" ]; then
    # Gọi gosu trực tiếp (không qua hàm) để $! là PID của chính postgres -> tín hiệu dừng tới đúng nơi
    gosu postgres postgres "${PG_OPTS[@]}" &
  else
    write_initdb_script
    docker-entrypoint.sh postgres "${PG_OPTS[@]}" &
  fi
  PG_PID=$!
  until pg_isready -h 127.0.0.1 -q; do
    kill -0 "$PG_PID" 2>/dev/null || { log "PostgreSQL thoát khi khởi động"; exit 1; }
    sleep 1
  done
}

clone_from() {
  local src=$1
  log "CLONE dữ liệu từ Primary $src (repmgr standby clone)"
  rm -rf "${PGDATA:?}"/* && mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA" && chmod 700 "$PGDATA"
  PGPASSWORD="$REPMGR_PASSWORD" as_pg repmgr -h "${src%%:*}" -p "${src##*:}" -U repmgr -d repmgr -f "$CONF" \
    standby clone --fast-checkpoint
}

# Nút từng là Primary nhưng cụm đã có Primary mới -> tua lại WAL rồi theo Primary mới
rejoin_as_standby() {
  local src=$1
  log "ĐÃ CÓ PRIMARY MỚI tại $src -> không được làm Primary nữa (fencing). Tua lại bằng pg_rewind..."
  # Đảm bảo thư mục dữ liệu ở trạng thái tắt sạch (cần cho pg_rewind nếu container bị kill)
  as_pg "$BIN/postgres" --single -D "$PGDATA" -c shared_preload_libraries= -c wal_log_hints=on -c wal_keep_size=256MB postgres < /dev/null > /dev/null 2>&1 || true
  if ! as_pg "$BIN/pg_rewind" -D "$PGDATA" -R --source-server="$(peer_conninfo "$src")"; then
    log "pg_rewind thất bại -> sao chép lại toàn bộ"
    clone_from "$src"
  fi
}

# Timeline hiện hành: Primary đọc từ tên file WAL đang ghi (đổi NGAY khi thăng cấp, còn
# pg_control_checkpoint() chỉ cập nhật sau checkpoint kế tiếp); Standby đọc từ checkpoint.
TL_SQL="select case when pg_is_in_recovery() then (select timeline_id from pg_control_checkpoint()) else ('x' || substr(pg_walfile_name(pg_current_wal_lsn()), 1, 8))::bit(32)::int end"
my_timeline() { psql -h 127.0.0.1 -U postgres -tAc "$TL_SQL" 2>/dev/null; }

# Fencing: nếu mình là Primary nhưng có Primary khác timeline cao hơn (được bầu khi mình bị
# cô lập) thì dừng PostgreSQL -> container khởi động lại -> rejoin_as_standby (pg_rewind).
fencing_watchdog() {
  local p mine theirs
  while sleep 3; do
    [ "$(psql -h 127.0.0.1 -U postgres -tAc 'select pg_is_in_recovery()' 2>/dev/null)" = "f" ] || continue
    mine=$(my_timeline)
    IFS=',' read -ra list <<< "$PEERS"
    for p in "${list[@]}"; do
      [ -z "$p" ] && continue
      theirs=$(psql "$(peer_conninfo "$p")" -tAc "select tl from ($TL_SQL) t(tl) where not pg_is_in_recovery()" 2>/dev/null || true)
      if [ -n "$theirs" ] && [ -n "$mine" ] && [ "$theirs" -gt "$mine" ]; then
        log "PHÁT HIỆN PRIMARY MỚI $p (timeline $theirs > $mine) -> tự hạ cấp, khởi động lại làm STANDBY"
        kill -INT "$PG_PID" 2>/dev/null || true
        return
      fi
    done
  done
}

shutdown() {
  log "nhận tín hiệu dừng"
  [ -n "${REPMGRD_PID:-}" ] && kill "$REPMGRD_PID" 2>/dev/null || true
  [ -n "$PG_PID" ] && kill -INT "$PG_PID" 2>/dev/null || true
  wait "$PG_PID" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA" && chmod 700 "$PGDATA"
write_repmgr_conf

if [ "$NODE_ROLE" = "witness" ]; then
  start_postgres
  primary=$(wait_peer_primary)
  log "đăng ký WITNESS với Primary $primary"
  until PGPASSWORD="$REPMGR_PASSWORD" as_pg repmgr -f "$CONF" witness register           -h "${primary%%:*}" -p "${primary##*:}" -U repmgr -d repmgr --force; do
    sleep 2; primary=$(wait_peer_primary)
  done
else
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    if [ "$INITIAL_ROLE" = "primary" ] && ! find_peer_primary > /dev/null; then
      log "khởi tạo PRIMARY mới"
    else
      clone_from "$(wait_peer_primary)"
    fi
  elif [ ! -f "$PGDATA/standby.signal" ]; then
    if primary=$(find_peer_primary); then rejoin_as_standby "$primary"; fi
  fi

  start_postgres
  if [ "$(psql -h 127.0.0.1 -U postgres -tAc 'select pg_is_in_recovery()')" = "t" ]; then
    log "đang chạy vai trò STANDBY (chỉ đọc, nhận WAL streaming)"
    # Primary có thể đang không liên lạc được (đứt mạng): thử vài lần rồi vẫn chạy tiếp
    for _ in 1 2 3 4 5; do as_pg repmgr -f "$CONF" standby register --force && break; sleep 2; done
  else
    log "đang chạy vai trò PRIMARY (nhận mọi lệnh ghi)"
    until as_pg repmgr -f "$CONF" primary register --force; do sleep 2; done
  fi
fi

as_pg repmgr -f "$CONF" cluster show || true
log "khởi động repmgrd (giám sát + tự động failover)"
( while true; do
    as_pg repmgrd -f "$CONF" --daemonize=false || true
    log "repmgrd dừng -> khởi động lại sau 2 s (đánh giá lại trạng thái cụm)"
    sleep 2
  done ) &
REPMGRD_PID=$!
[ "$NODE_ROLE" = "data" ] && fencing_watchdog &

wait -n "$PG_PID" "$REPMGRD_PID"
code=$?
log "tiến trình con dừng (mã $code) -> dừng container"
kill "$REPMGRD_PID" "$PG_PID" 2>/dev/null || true
exit "$code"
