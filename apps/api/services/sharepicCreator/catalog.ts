/**
 * What the sharepic creator may put on a draft: the stock photos we host,
 * and photos found live on Unsplash — both searched with English words, the
 * photo tags are English. A live photo is never copied: it keeps the file
 * name scheme of our own (`<photographer>-<id>-unsplash.jpg`), and
 * `/api/image-picker/stock-image/` sends the browser on to Unsplash for it.
 */
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLogger } from '../../utils/logger.js';
import { getAttribution, parseFilename } from '../image/UnsplashAttributionService.js';
import { getUnsplashService, type StockImage } from '../unsplash/UnsplashApiService.js';

import type { UnsplashAttribution } from '../image/types.js';

const log = createLogger('sharepicCreator:catalog');

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

/** A photo a draft may show: one of ours, or a live Unsplash hit (`live`). */
export interface FoundPhoto {
  filename: string;
  alt_text: string;
  live: StockImage | null;
}

/** Live hits per search term, after our own: the prompt lists every one. */
const LIVE_PER_QUERY = 4;

async function searchLive(query: string): Promise<StockImage[]> {
  try {
    // A sharepic is 4:5 or 9:16 — a landscape photo loses most of itself.
    const found = await getUnsplashService().searchPhotos(query, 1, LIVE_PER_QUERY, 'portrait');
    return found.results;
  } catch (error) {
    // No key, quota or outage: the draft goes on with our own photos.
    log.warn(`live search for "${query}" failed: ${(error as Error).message}`);
    return [];
  }
}

/** Our own photos first — they are chosen for the party — then live ones. */
export async function findStockPhotos(queries: readonly string[]): Promise<FoundPhoto[]> {
  const live = await Promise.all(queries.map(searchLive));
  const found = queries.flatMap((query, i) => [
    ...searchStockPhotos(query).map((p) => ({
      filename: p.filename,
      alt_text: p.alt_text,
      live: null,
    })),
    ...live[i]!.map((image) => ({
      filename: image.filename,
      alt_text: image.alt_text,
      live: image,
    })),
  ]);
  return [...new Map(found.map((p) => [p.filename, p])).values()];
}

/**
 * The Unsplash record behind a stock file name we do not host — a photo an
 * earlier draft found live. Null for our own photos and unknown names.
 */
export async function liveStockPhoto(filename: string): Promise<StockImage | null> {
  if (hasStockPhoto(filename)) return null;
  const parsed = parseFilename(filename);
  if (!parsed) return null;
  try {
    return await getUnsplashService().getPhoto(parsed.photoId);
  } catch (error) {
    log.warn(`no Unsplash photo for ${filename}: ${(error as Error).message}`);
    return null;
  }
}

/** The credit for a stock photo, with the photographer's real name where Unsplash has it. */
export async function stockPhotoCredit(filename: string): Promise<UnsplashAttribution | null> {
  return (await liveStockPhoto(filename))?.attribution ?? getAttribution(filename);
}
