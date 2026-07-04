/**
 * PPTX export for reveal.js decks via pandoc.
 *
 * The deck is rendered to pandoc-flavoured markdown (one level-2 heading per
 * slide, fenced code blocks, `::: notes` divs for speaker notes) and converted
 * to PowerPoint with `pandoc -t pptx`. Grüne styling rides on an optional
 * `--reference-doc` template; when it (or pandoc itself) is absent the caller
 * surfaces a clear error.
 */

import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

import { type Slide } from '@gruenerator/contracts';

const execFileAsync = promisify(execFile);

/** Optional themed reference deck; absent in V1 → pandoc's default template. */
function referenceDocPath(): string | null {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(dir, '../../assets/gruene-reference.pptx');
  return existsSync(candidate) ? candidate : null;
}

/** Render a deck to pandoc markdown (slide-level 2). Hidden slides are omitted. */
export function renderDeckToPandocMarkdown(slides: readonly Slide[], title: string): string {
  const blocks: string[] = [`% ${title || 'Präsentation'}`];

  for (const slide of slides) {
    if (slide.hidden) continue;
    let block = `## ${(slide.title || 'Folie').replace(/\n/g, ' ')}`;

    if (slide.layout === 'code') {
      block += `\n\n\`\`\`${slide.codeLanguage ?? ''}\n${slide.body}\n\`\`\``;
    } else if (slide.body.trim() !== '') {
      block += `\n\n${slide.body.trim()}`;
    }

    if (slide.notes.trim() !== '') {
      block += `\n\n::: notes\n${slide.notes.trim()}\n:::`;
    }
    blocks.push(block);
  }

  return blocks.join('\n\n');
}

/** Safe filename for the Content-Disposition header (no header injection). */
export function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .trim()
    .slice(0, 80);
  return cleaned || 'Praesentation';
}

export class PandocUnavailableError extends Error {
  constructor() {
    super('pandoc is not installed');
    this.name = 'PandocUnavailableError';
  }
}

/**
 * Convert a deck to a PPTX buffer via pandoc. Throws PandocUnavailableError
 * when the binary is missing (mapped to HTTP 501 by the caller).
 */
export async function exportPresentationToPptx(
  slides: readonly Slide[],
  title: string
): Promise<Buffer> {
  const markdown = renderDeckToPandocMarkdown(slides, title);
  const dir = await mkdtemp(path.join(tmpdir(), 'gruen-pptx-'));
  const inputPath = path.join(dir, 'deck.md');
  const outputPath = path.join(dir, 'deck.pptx');
  try {
    await writeFile(inputPath, markdown, 'utf8');
    const args = ['-f', 'markdown', '-t', 'pptx', '--slide-level=2', '-o', outputPath];
    const refDoc = referenceDocPath();
    if (refDoc) args.push(`--reference-doc=${refDoc}`);
    args.push(inputPath);
    try {
      await execFileAsync('pandoc', args, { timeout: 30_000 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new PandocUnavailableError();
      throw err;
    }
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
