# Imagen del backend Node. Se construye desde la RAÍZ del repo (monorepo npm workspaces):
#   docker build -f services/Dockerfile .
FROM node:20-alpine
WORKDIR /app

COPY . .
RUN npm ci \
 && npm run build --workspace services \
 && npm prune --omit=dev

ENV NODE_ENV=production
WORKDIR /app/services
EXPOSE 3000
CMD ["npm", "start"]
