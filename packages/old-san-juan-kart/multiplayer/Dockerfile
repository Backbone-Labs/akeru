FROM node:24.21.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global npm@11.21.0
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages ./packages
COPY compliance ./compliance
COPY scripts ./scripts
RUN npm ci && npm run build:kart-multiplayer
ENV HOST=0.0.0.0 PORT=2567 NODE_ENV=production
USER node
EXPOSE 2567
CMD ["node", "packages/old-san-juan-kart/multiplayer/server.mjs"]
