# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup.spec.ts >> Signup flow >> rejects short password
- Location: e2e/signup.spec.ts:28:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: apiRequestContext._wrapApiCall: ENOENT: no such file or directory, open '/home/runner/workspace/test-results/.playwright-artifacts-3/traces/e5334e3b62ca8fd4a4b6-71907e60e1c711035b7e.trace'
```

# Page snapshot

```yaml
- generic [ref=e2]: Cannot GET /register
```