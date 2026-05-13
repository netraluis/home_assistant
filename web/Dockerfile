# Glibc (no musl) → @next/swc-linux-arm64-gnu, evita SIGILL bajo QEMU arm64.
FROM node:20-bookworm-slim
WORKDIR /app

COPY . .
RUN npm ci \
 && npm run build --workspace web \
 && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "web"]
