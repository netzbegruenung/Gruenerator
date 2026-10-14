/**
 * The Grünerator-Vorlagen catalogue for sharepics, read from the private
 * content checkout: `<internContentRoot()>/sharepic-vorlagen/{de,at}.json`,
 * one file per country, plus `thumbs/<id>.webp`.
 *
 * A missing directory is an empty catalogue and a warning — the gallery then
 * simply has no Grünerator section (same degradation as `internalPrompts.ts`).
 * An invalid entry is logged and skipped, so one typo does not empty a country.
 *
 * Cached in memory; the files are re-stat'ed at most every `RECHECK_MS` and the
 * catalogue is reloaded when Salt rolled out new content. Each Vorlage carries
 * a `thumbVersion` (hash of its thumbnails) so clients can cache the images forever.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  isSharepicSceneRef,
  isSharepicUploadId,
  sharepicVorlageFileEntrySchema,
  slidePhotoFilename,
  type SharepicCreatorLocale,
  type SharepicPhotoAttribution,
  type SharepicVorlage,
} from '@gruenerator/contracts';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { getAttribution } from '../image/UnsplashAttributionService.js';
import { internContentRoot } from '../skills/internalPrompts.js';

const log = createLogger('sharepicVorlagen');

const FILES: Record<SharepicCreatorLocale, string> = { 'de-DE': 'de.json', 'de-AT': 'at.json' };

const dir = (): string => path.join(internContentRoot(), 'sharepic-vorlagen');

const RECHECK_MS = 30_000;

let cache: SharepicVorlage[] | null = null;
let cacheSignature = '';
let checkedAt = 0;

const thumbName = (id: string, seite: number): string =>
  seite === 1 ? `${id}.webp` : `${id}-${seite}.webp`;

function statKey(file: string): string {
  try {
    const { mtimeMs, size } = statSync(file);
    return `${mtimeMs}:${size}`;
  } catch {
    return '-';
  }
}

function contentSignature(): string {
  const thumbs = path.join(dir(), 'thumbs');
  let names: string[] = [];
  try {
    names = readdirSync(thumbs).sort();
  } catch {
    names = [];
  }
  return [
    dir(),
    ...Object.values(FILES).map((name) => statKey(path.join(dir(), name))),
    statKey(thumbs),
    ...names.map((name) => `${name}:${statKey(path.join(thumbs, name))}`),
  ].join('|');
}

function thumbVersionOf(id: string, slideCount: number): string | undefined {
  const hash = createHash('sha1');
  let found = false;
  for (let seite = 1; seite <= slideCount; seite++) {
    try {
      hash.update(readFileSync(path.join(dir(), 'thumbs', thumbName(id, seite))));
      found = true;
    } catch {
      continue;
    }
  }
  return found ? hash.digest('hex').slice(0, 12) : undefined;
}

function attributionsOf(entry: {
  spec: SharepicVorlage['spec'];
}): (SharepicPhotoAttribution | null)[] {
  return entry.spec.slides.map((slide) => {
    const photo = slidePhotoFilename(slide);
    if (!photo || isSharepicUploadId(photo) || isSharepicSceneRef(photo)) return null;
    const credit = getAttribution(photo);
    return credit
      ? {
          photographer: credit.photographer,
          profileUrl: credit.profileUrl,
          photoUrl: credit.photoUrl,
        }
      : null;
  });
}

function loadCountry(locale: SharepicCreatorLocale): SharepicVorlage[] {
  const file = path.join(dir(), FILES[locale]);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    log.warn(
      `No sharepic Vorlagen at ${file} — check the Salt rollout. (${toError(error).message})`
    );
    return [];
  }
  if (!Array.isArray(raw)) {
    log.error(`${file} is not a JSON array`);
    return [];
  }
  return raw.flatMap((item, i) => {
    const parsed = sharepicVorlageFileEntrySchema.safeParse(item);
    if (!parsed.success) {
      log.error(`${file}[${i}] skipped: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      return [];
    }
    if (parsed.data.spec.locale !== locale) {
      log.error(
        `${file}[${i}] skipped: spec.locale ${parsed.data.spec.locale} in the ${locale} file`
      );
      return [];
    }
    return [
      {
        ...parsed.data,
        locale,
        attributions: attributionsOf(parsed.data),
        thumbVersion: thumbVersionOf(parsed.data.id, parsed.data.spec.slides.length),
      },
    ];
  });
}

function all(): SharepicVorlage[] {
  const now = Date.now();
  if (cache && now - checkedAt >= RECHECK_MS) {
    checkedAt = now;
    if (contentSignature() !== cacheSignature) cache = null;
  }
  if (!cache) {
    checkedAt = now;
    cacheSignature = contentSignature();
    const seen = new Set<string>();
    cache = [...loadCountry('de-DE'), ...loadCountry('de-AT')].filter((v) => {
      if (seen.has(v.id)) {
        log.error(`Duplicate sharepic Vorlage id "${v.id}" skipped`);
        return false;
      }
      seen.add(v.id);
      return true;
    });
    log.info(`Loaded ${cache.length} sharepic Vorlage(n) from ${dir()}`);
  }
  return cache;
}

/** The country's Vorlagen, or both countries' when `locale` is null. */
export function listSharepicVorlagen(locale: SharepicCreatorLocale | null): SharepicVorlage[] {
  return locale ? all().filter((v) => v.locale === locale) : all();
}

export function getSharepicVorlage(id: string): SharepicVorlage | null {
  return all().find((v) => v.id === id) ?? null;
}

/**
 * Absolute path of a slide's thumbnail (1-based), or null for an unknown id or
 * slide. The file may still be missing. Slide 1 is `<id>.webp`, the cover the
 * gallery card shows; further slides are `<id>-<n>.webp`.
 */
export function sharepicVorlageThumbFile(id: string, seite = 1): string | null {
  const vorlage = getSharepicVorlage(id);
  if (!vorlage || !Number.isInteger(seite) || seite < 1 || seite > vorlage.spec.slides.length) {
    return null;
  }
  return path.join(dir(), 'thumbs', thumbName(id, seite));
}

/** Tests only. */
export function resetSharepicVorlagenCache(): void {
  cache = null;
  cacheSignature = '';
  checkedAt = 0;
}
