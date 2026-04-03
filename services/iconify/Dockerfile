FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache git && \
    git clone --depth 1 https://github.com/iconify/api.git . && \
    npm install && \
    npm run build && \
    apk del git

ENV ICONIFY_PORT=3100
EXPOSE 3100

CMD ["npm", "run", "start"]
