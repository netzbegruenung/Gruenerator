import sharp from 'sharp';

export async function toJpegBase64(
  dataUrl: string,
  box: { width: number; height: number }
): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const buffer = await sharp(Buffer.from(base64, 'base64'))
    .resize({ ...box, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buffer.toString('base64');
}
