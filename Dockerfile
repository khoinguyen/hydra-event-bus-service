FROM node:8.7

# Create app directory
WORKDIR /usr/src/app

COPY package.json yarn.lock ./
COPY config/k8s-config.json config/config.json

RUN yarn install --production

# Bundle app source
COPY . .

EXPOSE 3000
CMD [ "npm", "start" ]
