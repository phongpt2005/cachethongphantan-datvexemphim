#!/bin/bash
set -e

echo "=== Cấu hình PostgreSQL Master cho Replication & repmgr ==="

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'repl_secure_pass_2026';
    CREATE ROLE repmgr WITH SUPERUSER LOGIN PASSWORD 'repmgr_pass_2026';
    CREATE DATABASE repmgr OWNER repmgr;
EOSQL

cat >> "$PGDATA/pg_hba.conf" <<EOF

# Cho phép replication qua mạng WireGuard VPN
host    replication     replicator      10.0.0.0/24     md5
host    all             repmgr          10.0.0.0/24     md5
host    repmgr          repmgr          10.0.0.0/24     md5

# Cho phép mạng Docker bridge nội bộ
host    replication     replicator      172.16.0.0/12   md5
host    all             repmgr          172.16.0.0/12   md5
host    repmgr          repmgr          172.16.0.0/12   md5
host    all             all             172.16.0.0/12   md5
EOF

echo "=== Khởi tạo Master hoàn tất! ==="
