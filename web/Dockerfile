FROM node:20-alpine
WORKDIR /app

COPY . .
RUN npm ci \
 && npm run build --workspace web \
 && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "web"]
