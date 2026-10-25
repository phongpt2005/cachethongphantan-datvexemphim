FROM postgres:15-alpine

RUN apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/testing repmgr bash

RUN mkdir -p /var/log/repmgr && chown postgres:postgres /var/log/repmgr

EXPOSE 5432
