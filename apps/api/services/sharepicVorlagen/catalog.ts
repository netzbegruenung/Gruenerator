/**
 * The Grünerator-Vorlagen catalogue for sharepics, read from the private
 * content checkout: `<internContentRoot()>/sharepic-vorlagen/{de,at}.json`,
 * one file per country, plus `thumbs/<id>.webp`.
 *
 * A missing directory is an empty catalogue and a warning — the gallery then
 * simply has no Grünerator section (same degradation as `internalPrompts.ts`).
 * An invalid entry is logged and skipped, so one typo does not empty a country.
 *
 * Cached after the first read: Salt writes the files before the service boots.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  isSharepicSceneRef,
  isSharepicUploadId,
  sharepicVorlageFileEntrySchema,
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

let cache: SharepicVorlage[] | null = null;

function attributionsOf(entry: {
  spec: SharepicVorlage['spec'];
}): (SharepicPhotoAttribution | null)[] {
  return entry.spec.slides.map(({ background }) => {
    if (background.kind === 'farbe') return null;
    if (isSharepicUploadId(background.filename) || isSharepicSceneRef(background.filename))
      return null;
    const credit = getAttribution(background.filename);
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
    return [{ ...parsed.data, locale, attributions: attributionsOf(parsed.data) }];
  });
}

function all(): SharepicVorlage[] {
  if (!cache) {
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
  return path.join(dir(), 'thumbs', seite === 1 ? `${id}.webp` : `${id}-${seite}.webp`);
}

/** Tests only. */
export function resetSharepicVorlagenCache(): void {
  cache = null;
}
