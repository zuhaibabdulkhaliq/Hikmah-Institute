# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
WORKDIR /app
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV NEXT_TELEMETRY_DISABLED=1 PDF_PYTHON=/opt/pdf/bin/python HOST=0.0.0.0
RUN --mount=type=secret,id=proxy_ca \
    apt-get update && apt-get install -y --no-install-recommends python3 python3-venv poppler-utils libpango-1.0-0 libpangoft2-1.0-0 fonts-noto-core fonts-noto-extra ca-certificates && \
    python3 -m venv /opt/pdf && \
    if [ -f /run/secrets/proxy_ca ]; then PIP_CERT=/run/secrets/proxy_ca /opt/pdf/bin/pip install --no-cache-dir weasyprint==66.0; else /opt/pdf/bin/pip install --no-cache-dir weasyprint==66.0; fi && \
    rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global pnpm@10.28.2 && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && chown -R node:node /app
USER node
EXPOSE 3000 3001
CMD ["node", "dist/api/main.js"]
