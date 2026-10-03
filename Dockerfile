# Estágio 1: build do frontend (React/Vite)
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Estágio 2: API (Fastify) + frontend estático, em um único container
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 PUBLIC_DIR=/app/public
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY backend/assets ./assets
COPY --from=web /web/dist ./public
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
