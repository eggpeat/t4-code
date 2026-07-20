# syntax=docker/dockerfile:1.7
FROM docker.io/oven/bun:1.3.14-debian@sha256:9dba1a1b43ce28c9d7931bfc4eb00feb63b0114720a0277a8f939ae4dfc9db6f
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/t4
COPY . /opt/t4
RUN bun install --ignore-scripts --lockfile-only \
    && bun install --frozen-lockfile --ignore-scripts
ENV NODE_ENV=production \
    HOME=/tmp \
    T4_CLUSTER_SERVER_PORT=8080 \
    T4_CLUSTER_ADMIN_PORT=9090
LABEL org.opencontainers.image.source="https://github.com/LycaonLLC/t4-code" \
      org.opencontainers.image.title="T4 stateless cluster server"
USER 10001:10001
EXPOSE 8080 9090
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/bun", "packages/cluster-server/src/main.ts"]
