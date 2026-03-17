# Expo & React Native Reference

> Referenced from `CLAUDE.md`. Load Expo skills when working on `apps/mobile` or `apps/docs-expo`.

## Expo SDK 55 (Current)

Both `apps/mobile` and `apps/docs-expo` run **Expo SDK 55** (React Native 0.83, React 19.2). Key differences from SDK 54:

- **New versioning**: All `expo-*` packages now share the SDK major version (e.g. `expo-image@~55.0.5` instead of `~3.0.11`)
- **`newArchEnabled`** — Removed from `app.json`. New Architecture is the only option since SDK 53.
- **`edgeToEdgeEnabled`** — Removed from `app.json`. Mandatory on Android 16+ (API 36).
- **`softwareKeyboardLayoutMode: "adjustNothing"`** — Removed from valid schema values. Use `react-native-keyboard-controller` instead.
- **`resolver.unstable_enablePackageExports`** — Now default in Metro. Removed from `metro.config.js`.
- **`expo-av`** — Removed from Expo Go. Use `expo-audio` + `expo-video` instead.
- **`expo-constants`** — Implicit dependency, no need to list in `package.json` (but keep if directly imported).

### Upgrading SDK

```bash
cd apps/mobile  # or apps/docs-expo
npx expo install expo@^<version>.0.0 --fix
# Then manually: pnpm add react@<expected> react-dom@<expected>
# Remove newArchEnabled, edgeToEdgeEnabled from app.json
# Remove unstable_enablePackageExports from metro.config.js
# Delete android/ and ios/ dirs (CNG regenerates them)
npx expo-doctor@latest  # Verify
```

## expo-file-system (SDK 55+)

`expo-file-system` uses a **class-based API** (`File`, `Directory`, `Paths`). The legacy function-based API (`cacheDirectory`, `writeAsStringAsync`, `EncodingType`) is deprecated and throws at runtime — use `expo-file-system/legacy` only as a last resort.

```tsx
import { File, Directory, Paths } from 'expo-file-system';

// Write bytes to cache
const file = new File(Paths.cache, 'export.pdf');
file.write(new Uint8Array(buffer)); // accepts string or Uint8Array
file.write('Hello, world!'); // string defaults to UTF-8

// Read
const text = file.textSync(); // sync
const text2 = await file.text(); // async
const bytes = await file.bytes(); // Uint8Array
const b64 = await file.base64(); // base64 string

// File properties (no async needed)
file.exists; // boolean
file.size; // number (bytes)
file.uri; // file:// URI (read-only, changes on move/rename)
file.type; // MIME type string

// Download
const downloaded = await File.downloadFileAsync(url, new Directory(Paths.cache, 'downloads'));

// Directories
Paths.cache; // Directory — system-clearable cache
Paths.document; // Directory — persistent storage
Paths.bundle; // Directory — bundled assets (read-only)
```

## Keyboard Handling in Tab Navigators

**Never use `KeyboardStickyView`** inside a Bottom Tab navigator. It positions from the **window bottom** (absolute), but the tab content area doesn't reach the window bottom — the tab bar sits below it. When the keyboard opens and Android hides the tab bar, `KeyboardStickyView`'s translation overshoots by the tab bar height, creating a gap between the input and the keyboard.

**Use `KeyboardAvoidingView`** from `react-native-keyboard-controller` instead. It works within the flex layout by adding padding, not by absolute-positioning from the window bottom. Wrap the screen content (not just the input):

```tsx
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

// WRONG — KeyboardStickyView creates gap equal to tab bar height
<KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
  <ComposerRoot>...</ComposerRoot>
</KeyboardStickyView>

// CORRECT — KeyboardAvoidingView wraps the screen content
<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
  <ThreadRoot style={{ flex: 1 }}>
    <ThreadMessages ... />
    <ComposerRoot style={{ paddingBottom: insets.bottom }}>
      ...
    </ComposerRoot>
  </ThreadRoot>
</KeyboardAvoidingView>
```

The `paddingBottom: insets.bottom` on the composer handles safe area when the keyboard is closed. When the keyboard opens, `KeyboardAvoidingView` adds padding that pushes the composer above the keyboard.

## Assistant UI ComposerInput (React Native)

**Never use `ComposerInput` from `@assistant-ui/react-native` directly.** It renders a fully controlled `<TextInput value={text} />` that reads every keystroke back from the store. On Android, the async JS→native round-trip causes the cursor to jump back one character when typing fast, making input feel laggy.

Instead, use an **uncontrolled `TextInput`** that writes to the store but never reads `value` back:

```tsx
import { useAui } from '@assistant-ui/react-native';

// WRONG — controlled, cursor jumps on fast typing
<ComposerInput multiline />;

// CORRECT — uncontrolled, syncs to store without reading back
const aui = useAui();
const inputRef = useRef<TextInput>(null);
<TextInput ref={inputRef} multiline onChangeText={(v) => aui.composer().setText(v)} />;
// Clear natively on send:
inputRef.current?.clear();
```

## Docs Expo (Android APK)

The `apps/docs-expo` Expo 55 app is built locally as a debug APK.

- **Android package**: `de.gruenerator.docs`

```bash
# 1. Check project health
cd apps/docs-expo && npx expo-doctor

# 2. (Re)generate native project (always run after dependency changes)
cd apps/docs-expo && npx expo prebuild --platform android --clean

# 3. Build the debug APK (single-arch for speed — device is arm64-v8a)
cd apps/docs-expo/android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a

# 4. APK output location:
#    apps/docs-expo/android/app/build/outputs/apk/debug/app-debug.apk
# Copy to Windows Downloads (WSL):
cp apps/docs-expo/android/app/build/outputs/apk/debug/app-debug.apk /mnt/c/Users/morit/Downloads/gruenerator-docs-debug.apk

# 5. Install on connected device via USB (WSL → Windows ADB)
ADB=/mnt/c/Users/morit/AppData/Local/Android/Sdk/platform-tools/adb.exe
$ADB install -r 'C:\Users\morit\Downloads\gruenerator-docs-debug.apk'

# 6. Set up Metro dev server for on-device debugging (always use port 8082, mirror to 8081)
$ADB reverse tcp:8082 tcp:8082
$ADB reverse tcp:8081 tcp:8082
cd apps/docs-expo && npx expo start --port 8082 --localhost
```

**Notes:**

- Use `npx expo-doctor` (not `expo doctor`) — the local CLI doesn't support it.
- `npx expo install --check` validates dependency versions against SDK 55.
- Metro config overrides (`unstable_enableSymlinks`, `watchFolders`) are required for pnpm monorepo support — expo-doctor warnings about these are expected.
- The `android/` directory is regenerated by prebuild and should not be committed (add to `.gitignore` if needed).
- TypeScript check: `npx tsc --noEmit --project apps/docs-expo/tsconfig.json`
- **URI scheme**: The docs app uses `gruenerator-docs://` (distinct from `apps/mobile` which uses `gruenerator://`). Both `app.json` scheme and `auth.ts` `makeRedirectUri` must match. This mirrors the Tauri desktop convention (`apps/desktop` → `gruenerator://`, `apps/docs-desktop` → `gruenerator-docs://`).
- **ADB in WSL**: USB devices aren't accessible from WSL — use Windows `adb.exe` with Windows-style paths (`C:\...`), not `/mnt/c/...`.
- **ADB reverse ports are ephemeral**: They reset after app uninstall/reinstall or ADB daemon restarts. Always re-run `adb reverse` after reinstalling.
- **Signature conflicts on reinstall**: `expo prebuild --clean` regenerates the debug keystore. Must `adb uninstall` before `adb install` (no `-r`) to avoid signature mismatch.
- **Yjs/lib0 dependency**: `isomorphic-webcrypto` is required for the Yjs collaboration layer used by BlockNoteEditor DOM components. If missing, the DOM bundle fails silently and documents show blank pages.
- **Fast debug builds**: Pass `-PreactNativeArchitectures=arm64-v8a` to `./gradlew assembleDebug` to build only for the target device arch. The default builds all 4 archs (armeabi-v7a, arm64-v8a, x86, x86_64) which is ~4x slower.
- **Avoid unnecessary `prebuild --clean`**: Only needed when native dependencies change. Incremental `./gradlew assembleDebug` reuses Gradle caches and is much faster.
- **Always use port 8082 for Metro in WSL**: Port 8081 is permanently occupied by ADB reverse tunnels. Always start Metro on 8082 and mirror both ports: `adb reverse tcp:8082 tcp:8082 && adb reverse tcp:8081 tcp:8082` (device app defaults to 8081, this redirects it to 8082).
- **Expo dev client doesn't auto-connect**: After installing a fresh debug APK, the Expo dev client shows its launcher instead of loading the app. Deep-link it to Metro: `$ADB shell am start -a android.intent.action.VIEW -d "exp+gruenerator://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" de.gruenerator.app`
- **DOM component debugging**: `console.log` inside `'use dom'` components goes to the WebView console (Chrome DevTools → Remote Devices), NOT Metro terminal. Render debug state on-screen instead.
- **Hot reload works for JS/TS changes**: When Metro is running, editing TypeScript/JSX files triggers hot reload on the device — no need to rebuild the APK. Only rebuild (`./gradlew assembleDebug`) when native dependencies change. A full APK rebuild for pure JS changes wastes time.
- **Metro cache stale after `--clear` restart**: When restarting Metro with `--clear`, the first bundle takes longer but is fresh. A `Bundled Xms (1 module)` line after changes usually means the cache is stale — restart Metro if this happens.
- **Docs Expo domains**: API is at `docs.gruenerator.eu/api`, Hocuspocus at `docs.gruenerator.eu/hocuspocus` (NOT `gruenerator.eu`).
