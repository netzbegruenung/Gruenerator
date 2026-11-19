/**
 * Export einer fertigen Word-Datei in ein verbundenes Laufwerk — eine Tür für
 * das Dokument-Menü im Chat und „Exportieren“ in Docs. Beide erzeugen die
 * .docx wie für den Download und schicken sie statt dessen an
 * `POST /api/connections/:provider/upload`.
 */
import {
  CLOUD_UPLOAD_FIELD,
  driveBrowseErrorSchema,
  driveUploadResponseSchema,
  type DriveProvider,
  type DriveUploadResponse,
} from '@gruenerator/contracts';

import { notifyError } from './notify';

export const CLOUD_EXPORT_LABELS: Record<DriveProvider, string> = {
  google: 'In Google Drive speichern',
  microsoft: 'In OneDrive speichern',
};

const PROVIDER_NAMES: Record<DriveProvider, string> = {
  google: 'Google Drive',
  microsoft: 'OneDrive',
};

export class CloudExportError extends Error {
  constructor(
    message: string,
    /** Das Konto muss neu verbunden werden (abgelaufen oder ohne Schreibrecht). */
    readonly reauth: boolean
  ) {
    super(message);
    this.name = 'CloudExportError';
  }
}

export async function uploadToCloud(
  fetchFn: (url: string, options?: RequestInit) => Promise<Response>,
  provider: DriveProvider,
  docx: Blob,
  filename: string
): Promise<DriveUploadResponse> {
  const form = new FormData();
  form.append(CLOUD_UPLOAD_FIELD, docx, filename);
  // No Content-Type header: the browser sets the multipart boundary itself.
  const response = await fetchFn(`/api/connections/${provider}/upload`, {
    method: 'POST',
    body: form,
  });
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) return driveUploadResponseSchema.parse(json);
  const failure = driveBrowseErrorSchema.safeParse(json);
  throw new CloudExportError(
    failure.success ? failure.data.message : `Export fehlgeschlagen (HTTP ${response.status})`,
    failure.success && failure.data.reauth
  );
}

/** Erfolg mit Link zur Datei, Fehler mit dem Satz der Route. */
export function notifyCloudExportResult(
  provider: DriveProvider,
  outcome: { ok: true; result: DriveUploadResponse } | { ok: false; error: unknown }
): void {
  const where = PROVIDER_NAMES[provider];
  if (!outcome.ok) {
    const { error } = outcome;
    const description =
      error instanceof CloudExportError
        ? error.reauth
          ? `${error.message} Einstellungen → Konnektoren → ${where}.`
          : error.message
        : 'Die Datei konnte nicht gespeichert werden.';
    notifyError(`Export nach ${where} fehlgeschlagen`, description);
    return;
  }
  const { webUrl, name } = outcome.result;
  void import('sonner')
    .then(({ toast }) => {
      toast.success(`In ${where} gespeichert`, {
        description: name,
        action: {
          label: 'Öffnen',
          onClick: () => window.open(webUrl, '_blank', 'noopener,noreferrer'),
        },
      });
    })
    .catch(() => {
      // sonner not installed in this host — nothing else to show.
    });
}
