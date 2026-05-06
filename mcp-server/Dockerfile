FROM python:3.12-slim

# Install uv and gzip utilities
RUN pip install uv && apt-get update && apt-get install -y --no-install-recommends gzip && rm -rf /var/lib/apt/lists/*

# Pin to v0.5.27 — matches local installation, uses storage_state.json auth
RUN uv tool install "notebooklm-mcp-cli==0.5.27"

# Make the CLI binary available on PATH
ENV PATH="/root/.local/bin:$PATH"

# Create the config directory notebooklm-mcp expects
RUN mkdir -p /root/.notebooklm

# Copy the startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Railway injects PORT; default to 8080
ENV PORT=8080

EXPOSE $PORT

CMD ["/start.sh"]
