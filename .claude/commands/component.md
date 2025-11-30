---
description: Create a new React component
argument-hint: '[component-name] [description]'
---

# Create React Component

**Component**: $1
**Purpose**: $2

Create a new React component following SEPilot Desktop conventions.

## Component Requirements

1. **Location**: Place in appropriate directory
   - Feature-specific: `components/[feature]/`
   - Shared/reusable: `components/`
   - UI primitives: Already in `components/ui/` (use existing)

2. **TypeScript**: Use strict typing

   ```typescript
   interface $1Props {
     // Define props with types
   }

   export function $1({ ...props }: $1Props): JSX.Element {
     // Implementation
   }
   ```

3. **Use shadcn/ui components**: Import from `@/components/ui/`
   - Button, Card, Dialog, Input, Select, etc.
   - Don't create custom UI primitives if shadcn/ui has them

4. **Follow patterns**:
   - Small, focused components
   - Separate concerns (UI vs logic)
   - Extract hooks for complex logic
   - Proper error handling
   - Accessibility (ARIA labels, keyboard nav)

5. **State management**:
   - Local state: `useState`
   - Side effects: `useEffect` with cleanup
   - Complex logic: Extract to custom hook

6. **IPC communication** (if needed):

   ```typescript
   const result = await window.electron.invoke('channel', data);

   // For streaming
   useEffect(() => {
     window.electron.on('stream:data', handleData);
     return () => {
       window.electron.off('stream:data', handleData);
     };
   }, []);
   ```

## After Creation

1. Run `pnpm run type-check` to validate types
2. Run `pnpm run lint` to check style
3. Test the component in the app
4. Request review with `/review components/[name].tsx`
