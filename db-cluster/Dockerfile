# PostgreSQL 15 + repmgr 5 (giám sát cụm, tự động failover) + iptables (mô phỏng đứt mạng khi demo)
FROM postgres:15-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-15-repmgr iptables \
 && rm -rf /var/lib/apt/lists/*

COPY pg_hba.conf /etc/postgresql/pg_hba.conf
COPY cluster-entrypoint.sh /usr/local/bin/cluster-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/cluster-entrypoint.sh /etc/postgresql/pg_hba.conf \
 && chmod +x /usr/local/bin/cluster-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/cluster-entrypoint.sh"]
