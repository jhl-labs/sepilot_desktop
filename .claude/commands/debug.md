---
description: Debug an issue or error
argument-hint: '[error-or-description]'
---

# Debug Issue

**Issue**: $1

Use the **debugger subagent** to investigate and fix this issue.

## Investigation Steps

1. Gather context:
   - What is the error message? (if any)
   - When does it happen?
   - What are the reproduction steps?
   - What changed recently?

2. Examine relevant files:
   - Use Read tool to inspect suspicious code
   - Use Grep to find related code patterns
   - Check `git diff` for recent changes
   - Check `git log` for related commits

3. Trace execution:
   - Follow the code path
   - Identify where behavior diverges
   - Check inputs and outputs at each step

4. Identify root cause:
   - What is actually causing this?
   - Why is it happening?

## Fix

Provide:

- Clear explanation of the root cause
- Minimal, targeted fix
- Code before/after comparison
- Explanation of why this fixes it
- Suggestions to prevent regression

## Validation

After fix:

- Run `pnpm run type-check`
- Run `pnpm run lint`
- Test the specific scenario
- Check for related issues
