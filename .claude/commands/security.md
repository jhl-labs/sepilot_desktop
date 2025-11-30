---
description: Security review of pending changes
---

# Security Review: Pending Changes

Analyze all pending changes (staged and unstaged) for security issues.

Run `git diff HEAD` to see all changes, then check for:

## 1. Credentials & Secrets

- API keys, tokens, passwords hardcoded?
- Connection strings with credentials?
- Environment secrets in code?
- Private keys or certificates?

## 2. Input Validation

- User inputs sanitized?
- XSS vulnerabilities in React components?
- SQL injection risks (if using database)?
- Path traversal vulnerabilities?

## 3. IPC Security

- All IPC messages validated?
- Command injection in bash/exec calls?
- File access properly restricted?
- User paths sanitized?

## 4. Data Handling

- Sensitive data logged?
- User paths or personal info exposed?
- Secrets in error messages?

## 5. Dependencies

- Any suspicious new packages?
- Known vulnerabilities? (run `pnpm audit`)

If any secrets or sensitive data found:

- **STOP** - Do not commit
- **WARN** the user immediately
- Suggest how to fix (use env vars, secure storage, etc.)

Provide a security report with severity levels:

- 🔴 Critical (blocking)
- 🟡 Important
- 🟢 Low risk
