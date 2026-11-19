# syntax=docker/dockerfile:1
# Imagenes para la API/worker, la web y el asistente del .env (ver docker-compose.yml)

FROM node:22-slim AS base
WORKDIR /app
# npm fijado: dos builds en dias distintos no deben usar npm distintos
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g npm@12.2.3

# --- Asistente que crea el .env (solo necesita bcryptjs, arma en segundos) ---
FROM base AS init
WORKDIR /init
RUN npm install --no-save --no-package-lock --no-audit --no-fund bcryptjs@^3.0.3
COPY scripts/init-env.mjs scripts/env-template.mjs ./
CMD ["node", "/init/init-env.mjs", "/host"]

# --- API y worker ---
FROM base AS api-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --ignore-scripts: el postinstall de la API corre prisma generate, que necesita el schema (se hace abajo)
RUN npm ci --ignore-scripts -w apps/api

FROM api-deps AS api-build
COPY apps/api apps/api
RUN npm run db:generate -w apps/api && npm run build -w apps/api

FROM base AS api
ENV NODE_ENV=production
COPY --from=api-build /app/node_modules node_modules
COPY --from=api-build /app/package.json package.json
COPY --from=api-build /app/apps/api apps/api
WORKDIR /app/apps/api
# No corre como root. `prisma migrate deploy` necesita el CLI, por eso quedan las dependencias de desarrollo
USER node
EXPOSE 3001
CMD ["node", "dist/main"]

# --- Web ---
FROM base AS web-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts -w apps/web

FROM web-deps AS web-build
# La URL de la API se incrusta al compilar: si cambia, hay que reconstruir la imagen
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY apps/web apps/web
RUN npm run build -w apps/web

# Solo las dependencias de produccion de la web (sin Tailwind, TypeScript ni las de la API)
FROM base AS web-prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts --omit=dev -w apps/web

FROM base AS web
ENV NODE_ENV=production
COPY --from=web-prod-deps /app/node_modules node_modules
COPY --from=web-prod-deps /app/package.json package.json
# node necesita escribir en .next (cache de Next)
COPY --from=web-build --chown=node:node /app/apps/web apps/web
WORKDIR /app/apps/web
USER node
EXPOSE 3000
# Binario de Next directo (no `npm run`): asi Node es el proceso 1 y recibe SIGTERM al parar
CMD ["/app/node_modules/.bin/next", "start"]
