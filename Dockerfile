# ---- Stage 1: build the React client ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- Stage 2: server (serves API + built client) ----
FROM node:22-alpine AS server
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV PORT=4000
EXPOSE 4000
CMD ["node","--experimental-sqlite","src/index.js"]
