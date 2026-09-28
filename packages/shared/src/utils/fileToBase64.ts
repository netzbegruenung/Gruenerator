/**
 * Reads a picked File as base64 — the one FileReader path for chat attachments
 * and the Reisekosten Beleg upload.
 */

/**
 * Maps a FileReader DOMException to an actionable, user-ready German message.
 * NotReadableError/SecurityError almost always mean the OS refused the read — on
 * Windows that's typically a .docx still open in Word (exclusive lock) or an
 * un-hydrated OneDrive "Files On-Demand" placeholder. The `[<name>]` suffix keeps
 * the cause diagnosable in telemetry (the bare "Fehler beim Lesen" gave neither
 * the user guidance nor us a reason).
 */
export function describeFileReadError(fileName: string, error: DOMException): Error {
  if (error.name === 'NotReadableError' || error.name === 'SecurityError') {
    return new Error(
      `Die Datei „${fileName}" konnte nicht gelesen werden — sie ist vermutlich in einem ` +
        `anderen Programm geöffnet (z. B. Word) oder noch nicht fertig synchronisiert. Bitte ` +
        `schließe sie (oder speichere eine Kopie) und versuche es erneut. [${error.name}]`
    );
  }
  return new Error(`Fehler beim Lesen: ${fileName} [${error.name}]`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single FileReader pass. Rejects with the raw DOMException (reader.error) so the
 * caller can inspect the cause and decide whether to retry.
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.includes(',')) {
        reject(new Error(`Fehler beim Konvertieren: ${file.name}`));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error(`Fehler beim Lesen: ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

export function fileToBase64(file: File): Promise<string> {
  return readFileAsBase64(file)
    .catch((error: unknown) => {
      // NotReadableError is often transient when the OS is still hydrating a
      // cloud placeholder (OneDrive "Files On-Demand"). Retry once; a real file
      // lock (open in Word) won't recover and falls through to the message below.
      if (error instanceof DOMException && error.name === 'NotReadableError') {
        return delay(200).then(() => readFileAsBase64(file));
      }
      throw error;
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException) throw describeFileReadError(file.name, error);
      throw error instanceof Error ? error : new Error(`Fehler beim Lesen: ${file.name}`);
    });
}
