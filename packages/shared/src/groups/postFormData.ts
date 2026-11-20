/** Eine Datei, wie React Native sie an `FormData` hängt: der Eintrag zeigt auf eine lokale URI. */
export interface NativeUploadFile {
  uri: string;
  name: string;
  type: string;
}

/** Web übergibt `File`s, React Native Dateien-Beschreibungen. */
export type GroupPostUploadFile = File | NativeUploadFile;

interface FormDataLike {
  append(name: string, value: string | Blob): void;
  // Die Dreiparameter-Form (mit Dateiname) gibt es nur für Blobs.
  append(name: string, value: Blob, fileName: string): void;
}

function isNativeFile(file: GroupPostUploadFile): file is NativeUploadFile {
  return typeof (file as NativeUploadFile).uri === 'string';
}

/**
 * Baut den Multipart-Körper eines Beitrags (`body`, `files`). `File`s gehen mit
 * Namen hinein; die React-Native-Form wird unverändert angehängt — RN liest die
 * Datei beim Senden selbst von der URI.
 */
export function buildGroupPostFormData<T extends FormDataLike>(
  formData: T,
  body: string,
  files: GroupPostUploadFile[]
): T {
  formData.append('body', body);
  for (const file of files) {
    if (isNativeFile(file)) {
      // RN-Boundary: FormData akzeptiert dort `{uri, name, type}` statt eines Blobs.
      formData.append('files', file as unknown as Blob);
    } else {
      formData.append('files', file, file.name);
    }
  }
  return formData;
}
