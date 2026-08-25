# ============================================================
# Second Brain - Backend Dockerfile
# ============================================================
FROM node:22-bookworm-slim AS base


WORKDIR /app

# Install build tools for native compilation
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --omit=dev && npm rebuild better-sqlite3

COPY src/ ./src/
COPY db/schema.sql ./db/schema.sql

# Create database volume directory
RUN mkdir -p /app/db

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_CLIENT=sqlite
ENV SQLITE_DB_PATH=/app/db/second_brain.sqlite

EXPOSE 4000

CMD ["node", "src/server.js"]
