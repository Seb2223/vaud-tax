FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=6969 STATIC_DIR=/app/dist/web REFERENCE_DIR=/app/research
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY research/*.txt ./research/
COPY research/zh/wegleitung-2025.flow.txt ./research/zh/
USER node
EXPOSE 6969
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:6969/api/health >/dev/null || exit 1
CMD ["node", "dist/server/index.js"]
