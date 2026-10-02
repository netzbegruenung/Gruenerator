/**
 * What the sharepic creator may put on a draft: the stock photos we already
 * host (no image costs), searched with English words — the photo tags are English.
 */
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface StockPhoto {
  filename: string;
  alt_text: string;
  category: string;
  tags: string[];
}

let photos: StockPhoto[] | null = null;

function loadPhotos(): StockPhoto[] {
  photos ??= (
    JSON.parse(
      readFileSync(
        path.join(__dirname, '../../public/sharepic_example_bg/image_alt_texts.json'),
        'utf8'
      )
    ) as { images: StockPhoto[] }
  ).images;
  return photos;
}

function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/)
    .filter((t) => t.length > 1);
}

const MIN_META_SCORE = 2;

/** "public-transport" → ["public", "transport"]; matching whole words keeps "pub" out of "public". */
function tagWords(tag: string): string[] {
  return tag.split('-');
}

function sameWord(a: string, b: string): boolean {
  return a === b || a === `${b}s` || b === `${a}s`;
}

export function searchStockPhotos(query: string, limit = 6): StockPhoto[] {
  const wanted = terms(query);
  return (
    loadPhotos()
      .map((photo) => {
        const tags = photo.tags.map((t) => t.toLowerCase());
        const alt = photo.alt_text.toLowerCase();
        let score = 0;
        // Tag/category matches alone decide relevance; the alt text only ranks.
        let metaScore = 0;
        for (const term of wanted) {
          if (tags.some((tag) => tag === term)) metaScore += 3;
          else if (tags.some((tag) => tagWords(tag).some((word) => sameWord(word, term))))
            metaScore += 2;
          if (photo.category === term) metaScore += 2;
          if (alt.includes(term)) score += 1;
        }
        return { photo, score: score + metaScore, metaScore };
      })
      // 70 photos: an alt-text-only hit is a coincidence, not a fit.
      .filter((hit) => hit.metaScore >= MIN_META_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((hit) => hit.photo)
  );
}

export function hasStockPhoto(filename: string): boolean {
  return loadPhotos().some((photo) => photo.filename === filename);
}
