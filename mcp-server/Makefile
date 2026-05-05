# Makefile — helpers for managing the notebooklm-mcp cloud deployment
#
# Usage:
#   make encode-auth        Print base64-encoded storage_state.json for Railway
#   make test-local         Run the server locally on port 8080
#   make docker-build       Build the Docker image locally
#   make docker-run         Run the Docker image locally (requires STORAGE_B64 env)

STORAGE_PATH := $(HOME)/.notebooklm/storage_state.json
IMAGE := notebooklm-mcp-server

.PHONY: encode-auth test-local docker-build docker-run

## Encode the local auth cookies for use as a Railway env var.
## Copy the output and set it as NOTEBOOKLM_STORAGE_STATE_B64 in Railway.
encode-auth:
	@echo "--- COPY EVERYTHING BELOW THIS LINE ---"
	@base64 -i "$(STORAGE_PATH)"
	@echo "--- END ---"

## Test the server locally without Docker (uses your existing auth)
test-local:
	notebooklm-mcp --transport http --host 0.0.0.0 --port 8080 --stateless

## Build the Docker image locally
docker-build:
	docker build -t $(IMAGE) .

## Run the Docker image locally — pass your encoded auth as STORAGE_B64
## Usage: STORAGE_B64=$$(base64 -i ~/.notebooklm/storage_state.json) make docker-run
docker-run: docker-build
	docker run --rm -p 8080:8080 \
	  -e NOTEBOOKLM_STORAGE_STATE_B64="$(STORAGE_B64)" \
	  -e PORT=8080 \
	  $(IMAGE)

## Refresh auth after Railway env var update
## Run this after re-authenticating locally: make encode-auth | pbcopy
encode-auth-clipboard:
	@base64 -i "$(STORAGE_PATH)" | pbcopy
	@echo "Base64-encoded auth copied to clipboard — paste into Railway env var NOTEBOOKLM_STORAGE_STATE_B64"
