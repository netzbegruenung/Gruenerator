#!/bin/sh
set -e

# Substitute environment variables in nginx config
# PORT and API_BASE_URL are injected by Coolify or docker-compose
envsubst '${API_BASE_URL} ${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting nginx on port ${PORT}"
echo "API proxy target: ${API_BASE_URL}"

# Execute the main command (nginx)
exec "$@"
