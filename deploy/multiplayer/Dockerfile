FROM node:24.19.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global npm@11.17.0
WORKDIR /app
COPY package.json package-lock.json .npmrc LICENSE ./
COPY packages ./packages
COPY compliance ./compliance
COPY scripts ./scripts
COPY deploy/multiplayer ./deploy/multiplayer
RUN npm ci --ignore-scripts
# The explicit builders fetch pinned commits and verify every inventoried source hash.
RUN node packages/old-san-juan-kart/build.mjs && node packages/old-san-juan-kart/multiplayer/build.mjs
RUN node packages/operation-blackline/build.mjs && node packages/operation-blackline/multiplayer/build.mjs
RUN node deploy/multiplayer/stage-runtime.mjs /runtime

FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /runtime ./
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
USER node
# Catch missing staged imports before an image can be published.
RUN node --input-type=module -e "await import('./packages/multiplayer/server.mjs')"
EXPOSE 8080
CMD ["node", "packages/multiplayer/server.mjs"]
