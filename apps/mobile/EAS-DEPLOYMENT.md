# EAS Build & Deployment Guide

## Project Configuration

This app is permanently linked to the Expo project:

- **Owner:** execom-inc
- **Project Name:** Bunkd
- **Slug:** bunkd
- **Project ID:** 13cf0542-2cdd-4642-a2b1-6a85169441c0
- **iOS Bundle ID:** com.execominc.bunkd
- **Android Package:** com.execominc.bunkd

**IMPORTANT:** This configuration is canonical and must not be changed. Any developer cloning this repo will automatically build against the same Expo project.

---

## Prerequisites

1. **EAS CLI** installed globally:
   ```bash
   npm install -g eas-cli
   ```

2. **Expo Account** with access to execom-inc organization
   ```bash
   eas whoami
   # Should show: execom or execom-inc
   ```

3. **Authentication:**
   ```bash
   eas login
   # Use execom-inc credentials
   ```

---

## Verify Project Linkage

```bash
cd apps/mobile
npx eas project:info
```

Expected output:
```
fullName  @execom-inc/bunkd
ID        13cf0542-2cdd-4642-a2b1-6a85169441c0
```

---

## Build Profiles

This project has three build profiles configured in `eas.json`:

### 1. Development Build
Internal distribution for testing with Expo Go features.

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

### 2. Preview Build
Internal distribution for testing production-like builds.

**iOS (Simulator):**
```bash
eas build --profile preview --platform ios
```

**Android (APK):**
```bash
eas build --profile preview --platform android
```

### 3. Production Build
Release builds for App Store and Google Play.

**iOS:**
```bash
eas build --profile production --platform ios
```

**Android:**
```bash
eas build --profile production --platform android
```

---

## Building for Both Platforms

Build for iOS and Android simultaneously:

```bash
eas build --platform all
```

---

## OTA Updates

This app is configured for Over-The-Air (OTA) updates using Expo Updates.

### Configuration
- **Enabled:** Yes
- **Check Automatically:** ON_LOAD
- **Runtime Version Policy:** appVersion

### Publishing Updates

**Publish to default branch:**
```bash
eas update --auto
```

**Publish to specific branch:**
```bash
eas update --branch production --message "Fix critical bug"
```

**Preview update before publishing:**
```bash
eas update --branch preview --message "Test new feature"
```

### Update Channels

The app checks for updates on launch. Updates are delivered based on the runtime version policy, which is tied to the app version in `app.json`.

---

## Environment Variables

### Required Secrets

The app requires these environment variables for Supabase integration:

1. **EXPO_PUBLIC_SUPABASE_URL**
2. **EXPO_PUBLIC_SUPABASE_ANON_KEY**

### Setting Secrets

**For builds:**
```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://qmhqfmkbvyeabftpchex.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key-here"
```

**List secrets:**
```bash
eas secret:list
```

### Using Environment Variables

In your code, access them via:
```typescript
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY;
```

Or update `lib/supabase.ts` to use environment variables:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qmhqfmkbvyeabftpchex.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-default-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## Submission to App Stores

### iOS App Store

1. **Build production version:**
   ```bash
   eas build --profile production --platform ios
   ```

2. **Submit to App Store:**
   ```bash
   eas submit --platform ios
   ```

   You'll need:
   - Apple Developer account credentials
   - App Store Connect API key (recommended)

### Google Play Store

1. **Build production version:**
   ```bash
   eas build --profile production --platform android
   ```

2. **Submit to Google Play:**
   ```bash
   eas submit --platform android
   ```

   You'll need:
   - Google Play Console credentials
   - Service account JSON key (for automated submission)

---

## Testing Builds

### iOS Simulator

1. Build for simulator:
   ```bash
   eas build --profile preview --platform ios
   ```

2. Download the .app or .tar.gz file

3. Install on simulator:
   ```bash
   # Extract if needed
   tar -xvf build.tar.gz

   # Install
   xcrun simctl install booted path/to/Bunkd.app

   # Launch
   xcrun simctl launch booted com.execominc.bunkd
   ```

### Android Device

1. Build APK:
   ```bash
   eas build --profile preview --platform android
   ```

2. Download APK from EAS dashboard or CLI output

3. Install on device:
   ```bash
   adb install path/to/build.apk
   ```

---

## CI/CD Integration

### GitHub Actions

Example workflow for automatic builds on push:

```yaml
name: EAS Build
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: npm install
        working-directory: apps/mobile

      - name: Build on EAS
        run: eas build --platform all --non-interactive --no-wait
        working-directory: apps/mobile
```

---

## Troubleshooting

### Build Fails with "Project not found"

Verify project linkage:
```bash
npx eas project:info
```

If incorrect, the projectId in `app.json` may have been changed. Restore it to:
```json
"extra": {
  "eas": {
    "projectId": "13cf0542-2cdd-4642-a2b1-6a85169441c0"
  }
}
```

### Authentication Issues

Re-login to EAS:
```bash
eas logout
eas login
```

### Build Stuck or Failing

Check build status:
```bash
eas build:list
eas build:view BUILD_ID
```

View build logs:
```bash
eas build:logs BUILD_ID
```

### Updates Not Applying

1. Check runtime version matches:
   ```bash
   eas update:view BRANCH_NAME
   ```

2. Verify app is checking for updates on launch (configured in app.json)

3. Clear app cache and reinstall

---

## Build Configuration Files

### app.json
Core Expo configuration with project metadata, bundle IDs, and updates configuration.

**Critical fields:**
- `expo.owner`: "execom-inc"
- `expo.slug`: "bunkd"
- `expo.extra.eas.projectId`: "13cf0542-2cdd-4642-a2b1-6a85169441c0"
- `expo.ios.bundleIdentifier`: "com.execominc.bunkd"
- `expo.android.package`: "com.execominc.bunkd"

### eas.json
EAS build and submit configuration.

**Build profiles:**
- `development`: For development builds with dev client
- `preview`: For internal testing (simulator/APK)
- `production`: For App Store/Play Store releases

---

## Best Practices

1. **Never change the projectId, owner, or slug** - This breaks the link to the Expo project

2. **Use environment variables for secrets** - Don't commit API keys to git

3. **Test with preview builds** before production releases

4. **Use OTA updates for JavaScript changes** - Much faster than full rebuilds

5. **Increment version numbers** for each release:
   - Update `version` in app.json
   - iOS: Update `buildNumber` if needed
   - Android: `versionCode` auto-increments with `autoIncrement: true`

6. **Monitor build queue** - Builds may take 10-30 minutes depending on queue

7. **Tag releases in git** after successful builds:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

---

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [Expo Updates Documentation](https://docs.expo.dev/versions/latest/sdk/updates/)
- [EAS CLI Reference](https://docs.expo.dev/eas/cli/)
- [Expo Dashboard](https://expo.dev/accounts/execom-inc/projects/bunkd)

---

**Last Updated:** January 11, 2026
