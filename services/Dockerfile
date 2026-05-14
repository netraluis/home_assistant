# Imagen del backend Node. Se construye desde la RAÍZ del repo (monorepo npm workspaces):
#   docker build -f services/Dockerfile .
FROM node:20-alpine
WORKDIR /app

COPY . .
RUN npm ci \
 && npm run build --workspace services \
 && npm prune --omit=dev

ENV NODE_ENV=production
# Sello de versión (visible en /api/status). Inyectados desde CI.
ARG COMMIT_SHA=dev
ARG BUILT_AT
ENV COMMIT_SHA=$COMMIT_SHA
ENV BUILT_AT=$BUILT_AT
WORKDIR /app/services
EXPOSE 3000
CMD ["npm", "start"]
