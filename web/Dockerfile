# Imagen del frontend Next.js. Se construye desde la RAÍZ del repo (monorepo npm workspaces):
#   docker build -f web/Dockerfile .
FROM node:20-alpine
WORKDIR /app

# La URL del backend Node se hornea en el bundle del cliente en build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY . .
RUN npm ci \
 && npm run build --workspace web \
 && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "web"]
