---
description: Design and implement a new feature
argument-hint: '[feature-name] [description]'
---

# New Feature Development

**Feature**: $1
**Description**: $2

Use the **architect subagent** to design this feature, then implement it.

## Design Phase

1. Read CLAUDE.md to understand project conventions
2. Design the architecture:
   - Component structure (frontend)
   - IPC handlers (backend)
   - Type definitions
   - Data flow
   - State management approach

3. Create a design document with:
   - File structure
   - IPC channel names
   - TypeScript types
   - Component hierarchy

## Implementation Phase

After design is approved:

1. Create necessary files:
   - `components/[feature]/` - React components
   - `electron/ipc/handlers/[feature].ts` - IPC handlers
   - `lib/types/[feature].ts` - TypeScript types
   - `lib/hooks/use[Feature].ts` - Custom hooks (if needed)

2. Follow conventions:
   - TypeScript strict mode
   - Explicit return types
   - IPC patterns from CLAUDE.md
   - shadcn/ui components
   - Small, focused components

3. Add error handling and validation

4. Test the implementation:
   - Run `pnpm run type-check`
   - Run `pnpm run lint`
   - Manually test the feature

5. Request code review using `/review`
