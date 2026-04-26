import type { PreviewValues } from '../types/templateResultTypes';

interface StoreState {
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  header?: string;
  subheader?: string;
  body?: string;
  eventTitle?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
}

export function buildPreviewValues(storeState: StoreState): PreviewValues {
  return {
    line1: storeState.line1,
    line2: storeState.line2,
    line3: storeState.line3,
    quote: storeState.quote,
    header: storeState.header,
    subheader: storeState.subheader,
    body: storeState.body,
    eventTitle: storeState.eventTitle,
    weekday: storeState.weekday,
    date: storeState.date,
    time: storeState.time,
    locationName: storeState.locationName,
    address: storeState.address,
  };
}

export function formatDownloadFilename(
  type: string | null | undefined,
  options: { formatId?: string | null; ext?: 'png' | 'jpeg' | 'pdf' } = {}
): string {
  const safeType = type || 'image';
  const ext = options.ext ?? 'png';
  const prefix = options.formatId ?? 'sharepic';
  return `${prefix}-${safeType}.${ext}`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
