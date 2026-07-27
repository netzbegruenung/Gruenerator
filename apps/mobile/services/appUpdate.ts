/**
 * What the settings row says about the running JS bundle, and what tapping it
 * does.
 *
 * Split out from the component because the interesting part is a precedence
 * question, not a rendering one: `useUpdates()` can report several things at
 * once (an update is available *and* a previous check errored), and the wrong
 * order produces a row that offers "Neu starten" while it is still downloading.
 */

export type AppUpdateStatus =
  | 'disabled'
  | 'restarting'
  | 'downloading'
  | 'checking'
  | 'pending'
  | 'available'
  | 'error'
  | 'idle';

/** What a tap should do. `none` means the row is not pressable at all. */
export type AppUpdateAction = 'none' | 'check' | 'download' | 'reload';

export interface AppUpdateInput {
  /** `expo.version` from app.json — the store version, which OTA never changes. */
  appVersion: string;
  /** `Updates.isEnabled`. False in Expo Go and in development builds. */
  isEnabled: boolean;
  isEmbeddedLaunch: boolean;
  /** Build time of the running bundle, or null when that is unknown. */
  createdAt: Date | null;
  isChecking: boolean;
  isDownloading: boolean;
  isRestarting: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean;
  hasError: boolean;
}

export interface AppUpdateRow {
  status: AppUpdateStatus;
  /** Right-hand text of the row. */
  value: string;
  action: AppUpdateAction;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * The version line when nothing is in flight.
 *
 * An embedded launch is the store build itself, so the store version says
 * everything. Once an update is running, that version no longer identifies the
 * code on the device — hence the date, which is the only thing that
 * distinguishes two installs of the same release from each other. That is the
 * whole reason this row exists: without it, "welcher Stand läuft bei dir?" is
 * unanswerable.
 */
function describeRunning(input: AppUpdateInput): string {
  if (input.isEmbeddedLaunch || !input.createdAt) return input.appVersion;
  return `${input.appVersion} · Stand ${formatDate(input.createdAt)}`;
}

export function describeAppUpdate(input: AppUpdateInput): AppUpdateRow {
  if (!input.isEnabled) {
    return { status: 'disabled', value: input.appVersion, action: 'none' };
  }

  // Busy states first: each of them is already the result of a tap, and
  // offering a second action mid-flight is how you get two parallel downloads.
  if (input.isRestarting) {
    return { status: 'restarting', value: 'Wird neu gestartet…', action: 'none' };
  }
  if (input.isDownloading) {
    return { status: 'downloading', value: 'Wird geladen…', action: 'none' };
  }
  if (input.isChecking) {
    return { status: 'checking', value: 'Suche nach Updates…', action: 'none' };
  }

  // A downloaded update outranks an available one: both flags are set once the
  // download finishes, and the useful offer is the restart, not another fetch.
  if (input.isUpdatePending) {
    return { status: 'pending', value: 'Update bereit — zum Neustart tippen', action: 'reload' };
  }
  if (input.isUpdateAvailable) {
    return { status: 'available', value: 'Update verfügbar', action: 'download' };
  }

  // Errors rank below everything actionable. A failed check next to a ready
  // update would be true and useless.
  if (input.hasError) {
    return { status: 'error', value: 'Suche fehlgeschlagen — erneut versuchen', action: 'check' };
  }

  return { status: 'idle', value: describeRunning(input), action: 'check' };
}
