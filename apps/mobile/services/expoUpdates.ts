// Type-only, so it is erased at build time and never becomes a runtime import —
// which is the whole point of the `require` below.
import type * as ExpoUpdates from 'expo-updates';

export type UpdatesModule = typeof ExpoUpdates;

/**
 * `expo-updates`, or null when this binary has no native side for it.
 *
 * `require`, not `import`, and that is the whole point: a static import is
 * hoisted and evaluated before any guard in the importing file could run, and
 * the module throws "Cannot find native module 'ExpoUpdates'" while it is being
 * evaluated. The stack said so exactly — `AppUpdateRow.tsx (2:1)`, the import
 * line. Because the settings sheet is reached from the root layout, that single
 * throw took the whole app down ("Route ./_layout.tsx is missing the required
 * default export").
 *
 * Which binaries are affected: every one built before this dependency was added.
 * That is each developer's current dev client and the Maestro builds, so every
 * reader has to survive the module's absence rather than assume everyone
 * rebuilt first.
 *
 * Evaluated once at module scope: the answer cannot change while the app runs.
 */
export const Updates: UpdatesModule | null = ((): UpdatesModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-updates') as UpdatesModule;
  } catch {
    return null;
  }
})();
