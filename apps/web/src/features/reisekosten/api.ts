import { getContractsClient } from '@gruenerator/shared/api';

import { fileToBase64 } from '../../utils/fileAttachmentUtils';

import type {
  BelegTyp,
  ExtractBelegResponse,
  ReisekostenState,
  ValidateResponse,
} from '@gruenerator/contracts';

export async function extractBeleg(file: File, belegType: BelegTyp): Promise<ExtractBelegResponse> {
  const base64 = await fileToBase64(file);
  const res = await getContractsClient().reisekosten.extractBeleg({
    body: {
      base64,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      belegType,
    },
  });
  if (res.status !== 200) throw new Error('Beleg konnte nicht ausgewertet werden');
  return res.body;
}

export async function validateReise(
  state: ReisekostenState,
  belege: ExtractBelegResponse[]
): Promise<ValidateResponse> {
  const res = await getContractsClient().reisekosten.validate({ body: { state, belege } });
  if (res.status !== 200) throw new Error('Validierung fehlgeschlagen');
  return res.body;
}

export async function generatePdf(
  state: ReisekostenState
): Promise<{ filename: string; blob: Blob }> {
  const res = await getContractsClient().reisekosten.pdf({ body: { state } });
  if (res.status !== 200) throw new Error('PDF konnte nicht erstellt werden');
  const bytes = Uint8Array.from(atob(res.body.pdfBase64), (ch) => ch.charCodeAt(0));
  return { filename: res.body.filename, blob: new Blob([bytes], { type: 'application/pdf' }) };
}
