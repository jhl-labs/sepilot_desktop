---
description: Code review for quality, security, and best practices
argument-hint: '[file-or-directory]'
---

# Code Review Request

Please review the code at: **$1**

Use the **code-reviewer subagent** to perform a comprehensive review.

Check for:

- Type safety and TypeScript best practices
- Security vulnerabilities (XSS, injection, hardcoded secrets)
- Electron IPC patterns and security
- React component best practices
- Performance issues
- Code style consistency with CLAUDE.md
- Error handling

Provide:

1. Overall assessment
2. Critical issues (blocking) 🔴
3. Important improvements 🟡
4. Nice-to-have suggestions 🟢
5. Positive findings ✅

Reference CLAUDE.md conventions and provide specific file:line locations.
