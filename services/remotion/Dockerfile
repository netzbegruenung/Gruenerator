FROM node:20-slim

# Install Chromium and FFmpeg (required by Remotion)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
      ffmpeg \
      fonts-noto-color-emoji \
      fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Tell Remotion/Puppeteer where Chromium is
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --prod || pnpm install --prod

# Copy source
COPY . .

# Create output directory
RUN mkdir -p /renders

ENV OUTPUT_DIR=/renders
ENV NODE_ENV=production

CMD ["pnpm", "worker"]
