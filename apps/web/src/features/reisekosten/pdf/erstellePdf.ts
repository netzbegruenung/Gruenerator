/**
 * Browser glue around `buildAbrechnungPdf`: fetches the selected belege from
 * IndexedDB and turns images pdf-lib cannot embed (WebP, GIF …) into PNG.
 */
import { sortBelegeNachFormular } from '@gruenerator/shared/reisekosten';

import { loadBelegFile } from '../belege/belegFiles';

import { buildAbrechnungPdf, type AnhangDatei, type ExportOptionen } from './buildAbrechnungPdf';

import type { BelegMeta, FormularResponse, ReisekostenState } from '@gruenerator/contracts';

async function toPng(blob: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('Bild konnte nicht umgewandelt werden');
  return new Uint8Array(await png.arrayBuffer());
}

async function toAnhang(meta: BelegMeta, blob: Blob): Promise<AnhangDatei> {
  const type = blob.type || meta.mimeType;
  if (type === 'application/pdf' || meta.dateiname.toLowerCase().endsWith('.pdf')) {
    return { meta, bytes: new Uint8Array(await blob.arrayBuffer()), format: 'pdf' };
  }
  if (type === 'image/jpeg') {
    return { meta, bytes: new Uint8Array(await blob.arrayBuffer()), format: 'jpg' };
  }
  if (type === 'image/png') {
    return { meta, bytes: new Uint8Array(await blob.arrayBuffer()), format: 'png' };
  }
  return { meta, bytes: await toPng(blob), format: 'png' };
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function dateinameFuer(state: ReisekostenState): string {
  const stamp = state.reise.rueckkehr.slice(0, 10) || 'reise';
  return `reisekosten-${stamp}.pdf`;
}

export async function erstellePdf(args: {
  abrechnungId: string;
  formular: FormularResponse;
  state: ReisekostenState;
  belege: BelegMeta[];
  optionen: ExportOptionen;
}): Promise<Blob> {
  const anhaenge: AnhangDatei[] = [];
  for (const meta of sortBelegeNachFormular(args.belege)) {
    const blob = await loadBelegFile(args.abrechnungId, meta.id);
    if (!blob) throw new Error(`Die Datei „${meta.dateiname}“ liegt nicht auf diesem Gerät.`);
    anhaenge.push(await toAnhang(meta, blob));
  }
  const bytes = await buildAbrechnungPdf({
    template: base64ToBytes(args.formular.pdfBase64),
    map: args.formular.map,
    state: args.state,
    optionen: args.optionen,
    anhaenge,
    heute: new Date(),
  });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
