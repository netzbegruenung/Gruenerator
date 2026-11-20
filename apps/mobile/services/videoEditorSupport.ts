/**
 * Whether this device gets the Video-Editor at all.
 *
 * The editor exports in the WebView with WebCodecs. iOS has `AudioEncoder` and
 * OPFS `createWritable` only from 26: below that the whole video sits in memory
 * and the audio runs through a WASM encoder, too much for a phone. So on iOS the
 * line is the OS version, decided here before the WebView opens.
 *
 * Android is not decided here: whether the device can encode H.264 depends on
 * its hardware codecs, not the OS version, and only the page can ask
 * (`VideoEncoder.isConfigSupported`). The editor's export says so itself.
 */
export function isVideoEditorSupported(os: string, version: string | number): boolean {
  if (os === 'android') return true;
  if (os !== 'ios') return false;
  const major = Number.parseInt(String(version), 10);
  return Number.isFinite(major) && major >= 26;
}
