# Claude Code Notes

## Vercel Build Settings (DO NOT CHANGE)
- Framework Preset: Next.js
- Root Directory: landing/
- Build Command: npm run build
- Output Directory: .next
- Include files outside root directory: Enabled

## Key Fixes

### TypeScript Build Errors
If TypeScript build fails with "Cannot find type definition" errors, the fix is in landing/tsconfig.json:
"typeRoots": ["./node_modules/@types"]

This prevents Vercel from picking up @types from the monorepo root node_modules.

### Tailwind CSS Not Loading
If Tailwind styles are not being applied (unstyled page), ensure landing/app/globals.css uses:
```css
@import "tailwindcss";
```

NOT the old v3 syntax:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Tailwind v4 requires the `@import` syntax to properly generate utility classes.
