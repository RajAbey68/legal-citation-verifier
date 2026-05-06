#!/bin/sh
# start.sh — restore Google auth from gzip+base64 env var, then launch notebooklm-mcp.
#
# notebooklm-mcp-cli v0.5.27 reads auth from ~/.notebooklm/storage_state.json
# We store the file gzip-compressed and base64-encoded to fit Railway's 32KB env var limit.
#
# Required env vars:
#   NOTEBOOKLM_STORAGE_STATE_GZ_B64  gzip | base64 of ~/.notebooklm/storage_state.json
#                                    Run: make encode-auth-compressed-clipboard
#   PORT                             Port to listen on (Railway injects this)

set -e

STORAGE_PATH="$HOME/.notebooklm/storage_state.json"
mkdir -p "$(dirname "$STORAGE_PATH")"

if [ -z "$NOTEBOOKLM_STORAGE_STATE_GZ_B64" ]; then
  echo "ERROR: NOTEBOOKLM_STORAGE_STATE_GZ_B64 is not set." >&2
  echo "Run 'make encode-auth-compressed-clipboard' locally and set in Railway env vars." >&2
  exit 1
fi

printf "%s" "$NOTEBOOKLM_STORAGE_STATE_GZ_B64" | base64 -d | gunzip > "$STORAGE_PATH"
echo "Auth restored — $(wc -c < "$STORAGE_PATH") bytes written to $STORAGE_PATH"

exec notebooklm-mcp \
  --transport http \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  --stateless
