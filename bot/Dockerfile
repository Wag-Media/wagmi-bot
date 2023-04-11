FROM node:18.15.0-alpine3.16
WORKDIR /app

RUN apk add --no-cache wget tar

ENV DOCKERIZE_VERSION v0.6.0
RUN wget -4 https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz

CMD dockerize -wait tcp://api-TEMPLATE:8081 -timeout 60m npm start
