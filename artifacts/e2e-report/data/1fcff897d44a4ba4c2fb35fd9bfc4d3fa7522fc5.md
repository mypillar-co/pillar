# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 10-ai-features.spec.ts >> AI Features >> Hero image picker section is visible on website page
- Location: artifacts/e2e/10-ai-features.spec.ts:39:7

# Error details

```
Error: apiRequestContext.get: connect ECONNREFUSED ::1:8080
Call log:
  - → GET http://localhost:8080/api/service/session-token?orgSlug=norwin-rotary-uic5&ttlSec=600
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - x-org-id: norwin-rotary-uic5
    - x-service-key: pillar-local-e2e-service-key

```