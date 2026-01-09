# Multi-stage build for optimal image size
# Cache busting argument for forced rebuilds
ARG CACHEBUST=1

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (better Docker layer caching)
COPY package*.json ./

# Install dependencies (including devDependencies needed for build)
RUN npm ci --silent

# Copy source code
COPY . .

# Build the static site
RUN npm run build

# Production stage - minimal nginx image
FROM nginx:alpine

# Clean nginx directory to remove old files
RUN rm -rf /usr/share/nginx/html/*

# Copy built files to nginx web root
COPY --from=builder /app/build /usr/share/nginx/html

# Debug: List files to ensure they're copied correctly
RUN ls -la /usr/share/nginx/html/

# Remove default nginx config and copy our custom config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
