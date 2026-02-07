# Grünerator Mobile (Capacitor)

Capacitor wrapper for the Grünerator web app, enabling native mobile deployment on iOS and Android.

## Prerequisites

- Node.js 18+
- pnpm 10+
- For Android: Android Studio with SDK 33+
- For iOS: Xcode 15+ and macOS

## Initial Setup

1. Install dependencies from the monorepo root:
   ```bash
   pnpm install
   ```

2. Add native platforms (run from this directory):
   ```bash
   pnpm add:android
   pnpm add:ios
   ```

3. Configure deep linking for OAuth:

   **Android** (`android/app/src/main/AndroidManifest.xml`):
   ```xml
   <intent-filter>
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="gruenerator" android:host="auth" />
   </intent-filter>
   ```

   **iOS** (`ios/App/App/Info.plist`):
   ```xml
   <key>CFBundleURLTypes</key>
   <array>
       <dict>
           <key>CFBundleURLSchemes</key>
           <array>
               <string>gruenerator</string>
           </array>
       </dict>
   </array>
   ```

## Development

### Android

```bash
# From monorepo root
pnpm dev:capacitor:android

# Or from this directory
pnpm dev:android
```

### iOS

```bash
# From monorepo root
pnpm dev:capacitor:ios

# Or from this directory
pnpm dev:ios
```

### Syncing Changes

After modifying web code, sync to native projects:
```bash
pnpm sync
```

## Building for Production

### Android

```bash
pnpm build:android
```

This generates a release APK/AAB in `android/app/build/outputs/`.

### iOS

```bash
pnpm build:ios
```

Open in Xcode for final archive and App Store submission.

## Troubleshooting

Run the Capacitor doctor to check your environment:
```bash
pnpm doctor
```

## Architecture

This app wraps the `apps/web` frontend using Capacitor's WebView. Key integrations:

- **Authentication**: Uses `@capacitor/browser` for OAuth flow with deep-link callback (`gruenerator://auth/callback`)
- **Storage**: Uses `@capacitor/preferences` for JWT token storage
- **Native Features**: Camera, Share, Clipboard via Capacitor plugins

See `apps/web/src/utils/capacitorAuth.ts` and `apps/web/src/utils/capacitorSecureStorage.ts` for implementation details.
