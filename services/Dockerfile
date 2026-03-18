FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Para desarrollo, usaremos ts-node-dev o similar si lo añades, 
# pero para el container básico:
CMD ["npm", "start"]
