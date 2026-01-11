# Bunkd Mobile App

BS Meter for product claims - Mobile app built with Expo and React Native.

## Project Information

- **Expo Owner:** execom-inc
- **Project:** @execom-inc/bunkd
- **Project ID:** 13cf0542-2cdd-4642-a2b1-6a85169441c0
- **iOS Bundle ID:** com.execominc.bunkd
- **Android Package:** com.execominc.bunkd

This configuration is **permanent and canonical**. Any developer cloning this repo will automatically build against the same Expo project.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npm start
# or
npx expo start
```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Project Structure

```
app/
├── (tabs)/         # Tab-based navigation
│   ├── index.tsx   # Analyze screen (home)
│   ├── history.tsx # Analysis history
│   └── _layout.tsx # Tab layout
├── about.tsx       # About/methodology screen
├── result.tsx      # Analysis results screen
├── share.tsx       # Share screen
└── _layout.tsx     # Root layout
lib/
├── api.ts          # Bunkd API client
└── supabase.ts     # Supabase client setup
```

## Building & Deployment

### Verify Project Linkage

```bash
npm run project:info
```

Expected output:
```
fullName  @execom-inc/bunkd
ID        13cf0542-2cdd-4642-a2b1-6a85169441c0
```

### Build Commands

**iOS:**
```bash
npm run build:ios                 # Production build
npm run build:preview:ios         # Preview/testing build
```

**Android:**
```bash
npm run build:android             # Production build
npm run build:preview:android     # Preview/testing build
```

**Both platforms:**
```bash
npm run build:all
```

### OTA Updates

Publish over-the-air JavaScript updates:
```bash
npm run update
```

### Full Documentation

See [EAS-DEPLOYMENT.md](./EAS-DEPLOYMENT.md) for comprehensive build and deployment instructions.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
