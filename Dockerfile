# Session Planner server + built UI in one container (amd64 and arm64).
# Data lives in /data (mount a volume); configuration comes from the environment, see .env.example.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    SP_HOST=0.0.0.0 \
    SP_DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && mkdir -p /data && chown node:node /data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/domain ./src/domain
USER node
EXPOSE 5175
HEALTHCHECK --interval=1m --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:5175/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/index.ts"]
