import { getGlobalApiClient } from '@gruenerator/shared/api';
import { File, Paths } from 'expo-file-system';

type CutoutErrorKind = 'rate_limited' | 'unavailable' | 'unauthorized';

const MESSAGES: Record<CutoutErrorKind, string> = {
  rate_limited: 'Zu viele Anfragen – bitte kurz warten.',
  unavailable: 'Freistellen gerade nicht möglich. Bitte später erneut versuchen.',
  unauthorized: 'Bitte melde dich erneut an.',
};

export class CutoutError extends Error {
  constructor(
    public readonly kind: CutoutErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'CutoutError';
  }
}

function toCutoutError(error: unknown): CutoutError {
  if (error instanceof CutoutError) return error;
  const status = (error as { response?: { status?: number } })?.response?.status;
  const kind: CutoutErrorKind =
    status === 429 ? 'rate_limited' : status === 401 ? 'unauthorized' : 'unavailable';
  return new CutoutError(kind, MESSAGES[kind]);
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Uploads the ref as-is and returns a file:// PNG with alpha in the cache. */
export async function cutoutFromRef(ref: { uri: string }): Promise<string> {
  const isPng = /\.png$/i.test(ref.uri.split('?')[0]);
  const form = new FormData();
  form.append('image', {
    uri: ref.uri,
    name: isPng ? 'image.png' : 'image.jpg',
    type: isPng ? 'image/png' : 'image/jpeg',
  } as unknown as Blob);

  try {
    const res = await getGlobalApiClient().post<{ image?: string }>('/background-removal', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const image = res.data?.image;
    if (!image) throw new CutoutError('unavailable', MESSAGES.unavailable);

    const file = new File(Paths.cache, `cutout-${Date.now()}.png`);
    file.write(decodeBase64(image.slice(image.indexOf(',') + 1)));
    return file.uri;
  } catch (error: unknown) {
    throw toCutoutError(error);
  }
}
