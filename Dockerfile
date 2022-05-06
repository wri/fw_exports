FROM node:16.14.2-alpine3.15
MAINTAINER server@3sidedcube.com

ENV NAME fw-exports

WORKDIR /opt/$NAME

COPY package.json ./
COPY yarn.lock ./
RUN yarn install

COPY ./app ./app
COPY ./config ./config
COPY ./.babelrc ./
COPY ./.eslintrc.yml ./.eslintrc.yml
COPY ./tsconfig.json ./
RUN yarn build

EXPOSE 3000

CMD ["node", "dist/app.js"]
