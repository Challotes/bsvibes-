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

# Seed the genesis DB into the volume on first boot (copy-if-empty; never
# overwrites a DB that already has posts), then start the app. Uses `;` not `&&`
# so a seed hiccup can never block the app from starting (it self-heals on the
# next redeploy since the post count is still 0).
CMD ["sh", "-c", "node scripts/seed-if-empty.mjs; npm start"]
