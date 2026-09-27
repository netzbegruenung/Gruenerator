/**
 * Handing a file to the user.
 *
 * The implementation moved to `@gruenerator/shared` so that the canvas editor
 * and the chat package share it: all three used to carry their own copy, and
 * none of the copies knew that a synthetic `<a download>` click does nothing
 * inside the mobile app's WebView. Re-exported from here so existing importers
 * keep their path.
 *
 * Both functions are async now — the native path has to read the bytes out.
 * Callers that do not sequence anything afterwards may `void` the result.
 */
export {
  downloadBlob,
  downloadDataUrl,
  downloadFile,
  NativeDownloadTooLargeError,
} from '@gruenerator/shared';
