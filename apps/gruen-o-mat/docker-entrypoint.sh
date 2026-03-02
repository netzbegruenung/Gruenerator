#!/bin/sh
set -e

# Substitute environment variables in nginx config.
# Restricted to ${API_BASE_URL} so nginx variables ($host, $uri, etc.) are untouched.
envsubst '${API_BASE_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Optional basic auth (set AUTH_USERNAME + AUTH_PASSWORD to enable)
if [ -n "$AUTH_USERNAME" ] && [ -n "$AUTH_PASSWORD" ]; then
  htpasswd -cb /etc/nginx/.htpasswd "$AUTH_USERNAME" "$AUTH_PASSWORD"
  sed -i 's|# __AUTH_PLACEHOLDER__|auth_basic "Gruen-O-Mat"; auth_basic_user_file /etc/nginx/.htpasswd;|g' \
    /etc/nginx/conf.d/default.conf
  echo "Basic auth enabled for user: ${AUTH_USERNAME}"
else
  echo "Basic auth disabled (AUTH_USERNAME not set)"
fi

echo "Starting nginx — API proxy target: ${API_BASE_URL}"

# Execute the main command (nginx)
exec "$@"
