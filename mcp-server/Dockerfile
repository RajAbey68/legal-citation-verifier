FROM python:3.12-slim

# Install uv for fast package management
RUN pip install uv

# Install notebooklm-mcp-cli
RUN uv tool install notebooklm-mcp-cli

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
