FROM node:24.19.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node node_modules/ws ./node_modules/ws
COPY --chown=node:node server ./server
USER node
EXPOSE 8080
CMD ["node", "server/main.mjs"]
