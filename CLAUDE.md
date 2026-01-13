# Claude Code Notes

## Vercel Build Settings (DO NOT CHANGE)
- Framework Preset: Next.js
- Root Directory: landing/
- Build Command: npm run build
- Output Directory: .next
- Include files outside root directory: Enabled

## Key Fix
If TypeScript build fails with "Cannot find type definition" errors, the fix is in landing/tsconfig.json:
"typeRoots": ["./node_modules/@types"]

This prevents Vercel from picking up @types from the monorepo root node_modules.
