/**
 * Opening a downloaded file in whatever app can *view* it.
 *
 * Not the same thing as sharing it, which is why this does not live in
 * `./share.ts`: on Android the share sheet is an `ACTION_SEND` chooser and
 * therefore only lists apps that want to *receive* a file (mail, chat, cloud
 * storage). A PDF reader registers `ACTION_VIEW`, so it never appears there —
 * from the share sheet the file can be sent anywhere but read nowhere.
 * `ACTION_VIEW` on a `content://` URI is the intent that opens a viewer, and
 * `FLAG_GRANT_READ_URI_PERMISSION` is what lets that viewer actually read the
 * file behind the URI. `Linking.openURL` cannot stand in for this: React
 * Native's `IntentModule` builds the `ACTION_VIEW` intent without any flags, so
 * the target app resolves the URI and is then denied by the FileProvider.
 *
 * iOS has no "open with". The activity sheet IS the system's viewing path there
 * (its preview opens Quick Look, and "In Dateien sichern" / Bücher take it from
 * there), so on iOS this stays the share sheet — with the file's UTI, without
 * which iOS cannot route the document to an app that handles it.
 */

import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { shareFile } from './share';

/** `Intent.FLAG_GRANT_READ_URI_PERMISSION` — see the header. */
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;

/** Uniform Type Identifiers for the MIME types we hand to iOS. */
const UTI_BY_MIME: Record<string, string> = {
  'application/pdf': 'com.adobe.pdf',
};

export interface OpenFileOptions {
  mimeType: string;
  dialogTitle?: string;
}

/**
 * Opens `fileUri` (a `file://` URI in the app's own storage) for viewing.
 *
 * Falls back to the share sheet when no app on the device can view the type —
 * a chooser is still a way out, an error is not.
 *
 * Note that the caller must keep the file around: the returned promise settles
 * when the viewer has been launched, not when the user is done with it.
 */
export async function openFile(fileUri: string, options: OpenFileOptions): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      // The `file://` URI cannot leave the app — every `ACTION_VIEW` on one has
      // thrown `FileUriExposedException` since Android 7.
      const contentUri = await getContentUriAsync(fileUri);
      // Deliberately no `FLAG_ACTIVITY_NEW_TASK`: `startActivityAsync` uses
      // `startActivityForResult`, which reports an immediate cancellation for
      // an activity started into a new task.
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: options.mimeType,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
      return;
    } catch (error) {
      // `ActivityNotFoundException` (no viewer installed) arrives here like any
      // other failure — the module rejects on every `Throwable`.
      console.warn('[openFile] no viewer for', options.mimeType, error);
    }
  }

  await shareFile(fileUri, {
    mimeType: options.mimeType,
    dialogTitle: options.dialogTitle,
    uti: UTI_BY_MIME[options.mimeType],
  });
}
