# Stable ASCENSION V1 runtime: bypass Railway's failing mise tool installer.
# This builds the existing application unchanged.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build
ENV NODE_ENV=production
ENV PORT=8080
ENV NITRO_HOST=0.0.0.0
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
