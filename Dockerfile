FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "npm", "run", "start" ]
