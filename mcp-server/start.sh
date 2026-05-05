#!/bin/sh
# start.sh — decode Google auth cookies from env var, then launch the MCP server.
#
# Required env vars:
#   NOTEBOOKLM_STORAGE_STATE_B64  Base64-encoded contents of storage_state.json
#   PORT                          Port to listen on (Railway injects this)
#
# Optional:
#   NOTEBOOKLM_MCP_DEBUG          Set to "true" for verbose logging

set -e

STORAGE_PATH="$HOME/.notebooklm/storage_state.json"
mkdir -p "$(dirname "$STORAGE_PATH")"

if [ -z "$NOTEBOOKLM_STORAGE_STATE_B64" ]; then
  echo "ERROR: NOTEBOOKLM_STORAGE_STATE_B64 is not set." >&2
  echo "Run 'make encode-auth' locally and set the output as a Railway env var." >&2
  exit 1
fi

echo "$NOTEBOOKLM_STORAGE_STATE_B64" | base64 -d > "$STORAGE_PATH"
echo "Auth decoded — $(wc -c < "$STORAGE_PATH") bytes written to $STORAGE_PATH"

exec notebooklm-mcp \
  --transport http \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  --stateless
