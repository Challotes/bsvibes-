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

# `npm start` runs the `prestart` hook (scripts/seed-if-empty.mjs) first — it
# seeds the genesis DB into the volume on first boot (copy-if-empty; never
# overwrites a DB with posts) — then `next start`. npm sequences the two, so no
# shell `;` is needed. (railway.toml's startCommand overrides this CMD on Railway
# but is also "npm start", so seeding happens either way via the prestart hook.)
CMD ["npm", "start"]
