FROM node:8.7

# Create app directory
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY config/k8s-config.json config/config.json

RUN npm install --production

# Bundle app source
COPY . .

EXPOSE 3000 
CMD [ "npm", "start" ]
