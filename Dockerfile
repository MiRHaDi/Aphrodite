FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev --ignore-scripts
COPY . .
ARG APHRODITE_BUILD_NONCE
RUN test -n "$APHRODITE_BUILD_NONCE" && node installer/build.mjs node /app/release

FROM node:24-bookworm-slim
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=build /app/release/ ./
USER node
ENV PORT=8080 DATA_DIR=/data NATIVE_ENABLED=true NODE_NO_WARNINGS=1
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/'+process.env.ADMIN_PATH+'/api/overview',{headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
