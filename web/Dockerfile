# Glibc (no musl) → @next/swc-linux-arm64-gnu, evita SIGILL bajo QEMU arm64.
FROM node:20-bookworm-slim
WORKDIR /app

# BACKEND_URL se hornea: Next.js evalúa rewrites() en build time, no en runtime.
# En la Pi: http://home_assistant:3000 (nombre del container backend, red Docker interna).
ARG BACKEND_URL=http://localhost:3000
ENV BACKEND_URL=$BACKEND_URL

COPY . .
RUN npm ci \
 && npm run build --workspace web \
 && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "web"]
