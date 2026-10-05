# Build only with the explicitly prepared, filtered server context.
FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends clang python3 git ca-certificates zlib1g-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git init upstream && cd upstream && git remote add origin https://github.com/redeclipse/base.git && git fetch --depth=1 origin faf378d12558addc700d0e464e7e8c3a39fbceee && git checkout --detach FETCH_HEAD && test "$(git rev-parse HEAD)" = faf378d12558addc700d0e464e7e8c3a39fbceee
RUN cp -R upstream/src src
COPY server/build-native.py ./build.py
RUN python3 build.py
FROM node:24.19.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/red-eclipse/package.json ./packages/red-eclipse/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace=@akeru/red-eclipse && npm cache clean --force
COPY --from=build /build/out/redeclipse-server ./redeclipse-server
COPY --from=build /build/upstream/config ./runtime/config
COPY --from=build /build/upstream/doc/license.txt ./notices/engine-license.txt
COPY maps ./runtime/data/maps
COPY notices ./notices
COPY server/servinit.cfg ./runtime/home/servinit.cfg
COPY server/service.cjs server/policy.cjs server/rooms.cjs server/check-runtime.cjs ./
RUN chown -R node:node /app/runtime/home
USER node
RUN node check-runtime.cjs
ENV PORT=8080
EXPOSE 8080
CMD ["node","service.cjs"]
