# Backend Dockerfile for Cloud Run
# Uses Node 18+ (required by Vertex AI SDK)
FROM node:18-slim
WORKDIR /app

# Install dependencies first
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source
COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]