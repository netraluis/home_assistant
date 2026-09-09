# Imagen del backend Node. Se construye desde la RAÍZ del repo (monorepo npm workspaces):
#   docker build -f services/Dockerfile .
FROM node:20-alpine
WORKDIR /app

COPY . .
# Instalamos SOLO los workspaces que necesita el backend. Un `npm ci` pelado
# instalaría también el árbol de `web` (Next, Base UI, hugeicons...), que no
# entra en esta imagen y que bajo la emulación QEMU arm64 del CI hace
# segfault a npm (exit 139).
RUN npm ci --include-workspace-root \
      --workspace services \
      --workspace packages/shared \
 && npm run build --workspace services \
 && npm prune --omit=dev --include-workspace-root \
      --workspace services \
      --workspace packages/shared

ENV NODE_ENV=production
# Sello de versión (visible en /api/status). Inyectados desde CI.
ARG COMMIT_SHA=dev
ARG BUILT_AT
ENV COMMIT_SHA=$COMMIT_SHA
ENV BUILT_AT=$BUILT_AT
WORKDIR /app/services
EXPOSE 3000
CMD ["npm", "start"]
