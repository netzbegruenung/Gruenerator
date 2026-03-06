#!/bin/sh
set -e

# Default EMBED_ALLOWED_ORIGINS to empty if unset
: "${EMBED_ALLOWED_ORIGINS:=}"
export EMBED_ALLOWED_ORIGINS

# Extract hostname from API_BASE_URL for proxy Host header and SNI
API_HOST=$(echo "$API_BASE_URL" | sed -E 's|^https?://||; s|[:/].*||')
export API_HOST

# Substitute environment variables in nginx config.
# Restricted to known variables so nginx variables ($host, $uri, etc.) are untouched.
envsubst '${API_BASE_URL} ${EMBED_ALLOWED_ORIGINS} ${API_HOST}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

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
if [ -n "$EMBED_ALLOWED_ORIGINS" ]; then
  echo "Embed allowed origins: ${EMBED_ALLOWED_ORIGINS}"
else
  echo "Embed framing: restricted to 'self' only (EMBED_ALLOWED_ORIGINS not set)"
fi

# Execute the main command (nginx)
exec "$@"
