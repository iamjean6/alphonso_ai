# --- Stage 1: Build the Frontend ---
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Stage 2: Final Runtime Image ---
FROM node:20-slim
WORKDIR /app

# Install Nginx
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# 1. Copy Frontend Build
COPY --from=builder /app/dist /usr/share/nginx/html

# 2. Setup Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend/ ./backend/

# 3. Setup Nginx Configuration
COPY nginx.conf /etc/nginx/nginx.conf

# 4. Setup Startup Script
COPY start.sh ./
RUN chmod +x start.sh

# Expose Nginx Port
EXPOSE 80

# Environment variables (Defaults, override at runtime)
ENV PORT=3000
ENV NODE_ENV=production

CMD ["./start.sh"]
