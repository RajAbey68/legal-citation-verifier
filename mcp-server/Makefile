# Makefile — helpers for managing the notebooklm-mcp cloud deployment
#
# notebooklm-mcp >= 0.6.x: uses NOTEBOOKLM_COOKIES env var directly
# notebooklm-mcp <= 0.5.x: used storage_state.json file
#
# Usage:
#   make encode-cookies         Print cookie string for Railway env var
#   make encode-cookies-clipboard  Copy cookie string to clipboard
#   make test-local             Run the server locally on port 8080
#   make refresh-railway-auth   Re-extract cookies and update Railway in one step

STORAGE_PATH := $(HOME)/.notebooklm/storage_state.json
IMAGE := notebooklm-mcp-server

.PHONY: encode-cookies encode-cookies-clipboard test-local refresh-railway-auth docker-build docker-run

## Extract essential Google cookies as a single cookie string.
## Copy the output and set it as NOTEBOOKLM_COOKIES in Railway.
encode-cookies:
	@python3 -c "\
import json; \
state = json.load(open('$(STORAGE_PATH)')); \
domains = {'.google.com', 'notebooklm.google.com', 'accounts.google.com'}; \
essential = {'SID','__Secure-1PSID','__Secure-3PSID','HSID','SSID','APISID','SAPISID','__Secure-1PAPISID','__Secure-3PAPISID','SIDCC','__Secure-1PSIDCC','__Secure-3PSIDCC','OSID','__Secure-OSID','__Secure-ENID','__Secure-1PSIDTS','__Secure-3PSIDTS','LSID','__Host-1PLSID','__Host-3PLSID','__Host-GAPS','NID'}; \
seen = set(); parts = []; \
[parts.append(f\"{c['name']}={c['value']}\") or seen.add(c['name']) for c in state['cookies'] if c['name'] in essential and c.get('domain','') in domains and c['name'] not in seen]; \
print('; '.join(parts))"

## Copy cookie string to clipboard and print confirmation.
encode-cookies-clipboard:
	@$(MAKE) encode-cookies | pbcopy
	@echo "✓ Cookie string copied to clipboard — paste as Railway env var NOTEBOOKLM_COOKIES"

## Refresh Railway env var from local auth in one step (requires railway CLI linked)
refresh-railway-auth:
	@COOKIES=$$($(MAKE) -s encode-cookies) && railway variables set NOTEBOOKLM_COOKIES="$$COOKIES" && echo "✓ Railway NOTEBOOKLM_COOKIES updated"

## Test the server locally without Docker (uses your existing auth)
test-local:
	notebooklm-mcp --transport http --host 0.0.0.0 --port 8080 --stateless

## Build the Docker image locally
docker-build:
	docker build -t $(IMAGE) .

## Run the Docker image locally
## Usage: make docker-run
docker-run: docker-build
	COOKIES=$$($(MAKE) -s encode-cookies) && \
	docker run --rm -p 8080:8080 \
	  -e NOTEBOOKLM_COOKIES="$$COOKIES" \
	  -e PORT=8080 \
	  $(IMAGE)
