# syntax=docker/dockerfile:1
# Multi-stage build. Targets: worker (this task); web is added in a later task.
ARG NODE_VERSION=24
ARG PNPM_VERSION=12.15.0

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# Full install (dev deps included) to bundle the worker with esbuild.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build:worker

# Runtime deps only; packages stay external in the bundle (--packages=external).
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION}-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist/worker.js ./dist/worker.js
USER node
CMD ["node", "dist/worker.js"]
