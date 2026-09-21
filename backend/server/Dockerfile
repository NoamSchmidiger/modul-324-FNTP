FROM node:24-alpine

LABEL service="myapp"

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY server.js ./

EXPOSE 3000

CMD ["npm", "start"]
