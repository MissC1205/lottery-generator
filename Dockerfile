FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install
COPY . .
EXPOSE 8080
ENV PORT=8080
ENV ADMIN_PASSWORD=admin888
CMD ["node", "server/server.js"]
