FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# NOTE: /data is provided by a Railway Volume (configured in the Railway dashboard),
# NOT a Docker VOLUME instruction — Railway rejects `VOLUME` at build time.
ENV DATABASE_PATH=/data/local.db
ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
