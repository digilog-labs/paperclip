FROM node:lts-alpine

# Install Docker CLI (for docker pull + docker compose)
RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app
COPY server.mjs .

EXPOSE 8765

CMD ["node", "server.mjs"]
