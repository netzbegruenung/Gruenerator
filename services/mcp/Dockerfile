FROM node:20-slim

# curl für Healthcheck installieren
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# OCI Image Labels (Standard für Container-Registries)
LABEL org.opencontainers.image.title="Gruenerator MCP Server"
LABEL org.opencontainers.image.description="MCP Server für Grüne Parteiprogramme (Deutschland & Österreich)"
LABEL org.opencontainers.image.source="https://github.com/Movm/Gruenerator-MCP"
LABEL org.opencontainers.image.documentation="https://github.com/Movm/Gruenerator-MCP#readme"
LABEL org.opencontainers.image.vendor="Gruenerator"
LABEL org.opencontainers.image.licenses="MIT"

# MCP Discovery Labels
LABEL mcp.discoverable="true"
LABEL mcp.transport="streamable-http"
LABEL mcp.endpoint="/mcp"

WORKDIR /app

# Package files kopieren
COPY package*.json ./

# Dependencies installieren
RUN npm ci --only=production

# Source Code kopieren
COPY src/ ./src/

# Port freigeben
EXPOSE 3000

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Server starten
CMD ["node", "src/index.js"]
