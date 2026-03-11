/**
 * Generates PNG thumbnails (128×128) from SVG illustrations.
 * Uses @napi-rs/canvas (already installed in apps/api).
 *
 * Usage: pnpm generate:thumbs
 */

import fs from 'node:fs';
import path from 'node:path';

const WEB_PUBLIC = path.resolve('apps/web/public/illustrations');
const THUMBS_DIR = path.resolve('apps/web/public/illustrations/thumbs');

const SOURCES = [
  { name: 'undraw', dir: path.join(WEB_PUBLIC, 'undraw') },
  { name: 'opendoodles', dir: path.join(WEB_PUBLIC, 'opendoodles') },
];

const THUMB_SIZE = 128;

async function loadCanvas() {
  // @napi-rs/canvas is installed in apps/api — resolve from there
  const canvasModule = await import('@napi-rs/canvas');
  return canvasModule;
}

async function generateThumbnail(
  canvas: Awaited<ReturnType<typeof loadCanvas>>,
  svgPath: string,
  outputPath: string
): Promise<boolean> {
  try {
    const svgData = fs.readFileSync(svgPath);
    const image = new canvas.Image();
    image.src = svgData;

    const c = canvas.createCanvas(THUMB_SIZE, THUMB_SIZE);
    const ctx = c.getContext('2d');

    // Scale SVG to fit within THUMB_SIZE while preserving aspect ratio
    const scale = Math.min(THUMB_SIZE / image.width, THUMB_SIZE / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const x = (THUMB_SIZE - w) / 2;
    const y = (THUMB_SIZE - h) / 2;

    ctx.drawImage(image, x, y, w, h);

    const pngBuffer = c.toBuffer('image/png');
    fs.writeFileSync(outputPath, pngBuffer);
    return true;
  } catch (err) {
    console.error(`  Failed: ${path.basename(svgPath)} — ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  const canvasModule = await loadCanvas();
  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const source of SOURCES) {
    const thumbDir = path.join(THUMBS_DIR, source.name);
    fs.mkdirSync(thumbDir, { recursive: true });

    const files = fs.readdirSync(source.dir).filter((f) => f.endsWith('.svg'));
    console.log(`\n${source.name}: ${files.length} SVGs`);

    for (const file of files) {
      const pngName = file.replace(/\.svg$/, '.png');
      const outputPath = path.join(thumbDir, pngName);

      // Skip if thumbnail already exists and is newer than source
      if (fs.existsSync(outputPath)) {
        const srcStat = fs.statSync(path.join(source.dir, file));
        const dstStat = fs.statSync(outputPath);
        if (dstStat.mtimeMs > srcStat.mtimeMs) {
          totalSkipped++;
          continue;
        }
      }

      const ok = await generateThumbnail(canvasModule, path.join(source.dir, file), outputPath);
      if (ok) totalGenerated++;
      else totalFailed++;
    }
  }

  console.log(
    `\nDone: ${totalGenerated} generated, ${totalSkipped} skipped (up-to-date), ${totalFailed} failed`
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
