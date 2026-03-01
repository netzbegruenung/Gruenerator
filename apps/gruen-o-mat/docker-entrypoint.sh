#!/bin/sh
set -e

# Substitute environment variables in nginx config.
# Restricted to ${API_BASE_URL} so nginx variables ($host, $uri, etc.) are untouched.
envsubst '${API_BASE_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting nginx — API proxy target: ${API_BASE_URL}"

# Execute the main command (nginx)
exec "$@"
