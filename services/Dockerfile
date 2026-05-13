FROM node:20-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # tsc → ./dist

FROM node:20-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev      # solo dependencies (sin ts-node, sin drizzle-kit)
COPY --from=build /usr/src/app/dist ./dist
# ⚠️  si aplicas migraciones drizzle al arrancar (migrate() lee archivos .sql),
#    descomenta y copia también la carpeta de migraciones:
# COPY --from=build /usr/src/app/drizzle ./drizzle
EXPOSE 3000
CMD ["npm", "start"]
