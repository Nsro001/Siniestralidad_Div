FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY shared /app/shared
RUN npm run build && npm prune --omit=dev
USER node
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
