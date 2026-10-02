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
const MIN_ALT_TERMS = 2;

/**
 * Visual filler words (English; queries are English). They recur across unrelated
 * photos — "interior" tags four trains and a bus — so they may rank a photo but
 * never admit one: only the other query terms count towards the gate.
 */
const GENERIC_TERMS = new Set([
  'interior',
  'indoor',
  'outdoor',
  'city',
  'urban',
  'street',
  'building',
  'people',
  'person',
  'group',
  'modern',
  'abstract',
  'landscape',
  'background',
  'day',
  'night',
]);

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
        const altWords = alt.split(/[^a-z0-9äöüß]+/);
        let score = 0;
        let metaScore = 0;
        // Gate counters over the non-generic terms only; gateAlt counts distinct query
        // terms found as whole words in the alt text.
        let gateMeta = 0;
        let gateAlt = 0;
        for (const term of wanted) {
          const generic = GENERIC_TERMS.has(term);
          let meta = 0;
          if (tags.some((tag) => tag === term)) meta += 3;
          else if (tags.some((tag) => tagWords(tag).some((word) => sameWord(word, term))))
            meta += 2;
          if (photo.category === term) meta += 2;
          metaScore += meta;
          if (!generic) gateMeta += meta;
          if (alt.includes(term)) score += 1;
          if (!generic && altWords.some((word) => sameWord(word, term))) gateAlt += 1;
        }
        return { photo, score: score + metaScore, gateMeta, gateAlt };
      })
      // 70 photos: a single alt-text word is a coincidence, not a fit. A hit needs
      // a tag/category match, or two distinct query terms in the alt text
      // ("dry cracked earth" → the drought photos, tagged only drought/soil).
      .filter((hit) => hit.gateMeta >= MIN_META_SCORE || hit.gateAlt >= MIN_ALT_TERMS)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((hit) => hit.photo)
  );
}

export function hasStockPhoto(filename: string): boolean {
  return loadPhotos().some((photo) => photo.filename === filename);
}
