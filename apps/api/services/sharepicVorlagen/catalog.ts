/**
 * The Grünerator-Vorlagen catalogue for sharepics, read from the private
 * content checkout: `<internContentRoot()>/sharepic-vorlagen/{de,at}.json`,
 * one file per country, plus `thumbs/<id>.webp`. The single Seiten sit beside
 * them in `seiten/{de,at}.json` with `thumbs/seiten/<id>.<format>.webp`.
 *
 * The editor offers only single Seiten: every Vorlage slide is one too
 * (`<vorlage>-s<n>`, previewed by the Vorlage's slide thumbnail), unless a
 * curated Seite names it as its `quelle` — that one has its own example text.
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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  isSharepicSceneRef,
  isSharepicUploadId,
  isSharepicVorlageRef,
  SHAREPIC_VORLAGE_REF,
  sharepicFormatSchema,
  sharepicSeiteFileEntrySchema,
  sharepicSpecSchema,
  sharepicVorlageFileEntrySchema,
  sharepicVorlageIdSchema,
  slidePhotoFilename,
  type SharepicFormat,
  type SharepicSeite,
  type SharepicSeiteRolle,
  type SharepicSeiteTyp,
  type SharepicSlide,
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

interface Catalog {
  vorlagen: SharepicVorlage[];
  seiten: SharepicSeite[];
  /** Preview file of each Seite taken from a Vorlage slide. */
  derivedThumbs: Map<string, string>;
}

let cache: Catalog | null = null;
let cacheSignature = '';
let checkedAt = 0;

const thumbName = (id: string, seite: number): string =>
  seite === 1 ? `${id}.webp` : `${id}-${seite}.webp`;

const seiteThumbName = (id: string, format: SharepicFormat): string => `${id}.${format}.webp`;

function statKey(file: string): string {
  try {
    const { mtimeMs, size } = statSync(file);
    return `${mtimeMs}:${size}`;
  } catch {
    return '-';
  }
}

function dirSignature(folder: string): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(folder).sort();
  } catch {
    names = [];
  }
  return [statKey(folder), ...names.map((name) => `${name}:${statKey(path.join(folder, name))}`)];
}

function contentSignature(): string {
  return [
    dir(),
    ...Object.values(FILES).map((name) => statKey(path.join(dir(), name))),
    ...Object.values(FILES).map((name) => statKey(path.join(dir(), 'seiten', name))),
    ...dirSignature(path.join(dir(), 'thumbs')),
    ...dirSignature(path.join(dir(), 'thumbs', 'seiten')),
  ].join('|');
}

/** Hash over the preview files that exist, or undefined when there is none. */
function thumbVersionOf(files: string[]): string | undefined {
  const hash = createHash('sha1');
  let found = false;
  for (const file of files) {
    try {
      hash.update(readFileSync(file));
      found = true;
    } catch {
      continue;
    }
  }
  return found ? hash.digest('hex').slice(0, 12) : undefined;
}

function attributionOf(slide: SharepicSlide): SharepicPhotoAttribution | null {
  const photo = slidePhotoFilename(slide);
  if (
    !photo ||
    isSharepicUploadId(photo) ||
    isSharepicSceneRef(photo) ||
    isSharepicVorlageRef(photo)
  )
    return null;
  const credit = getAttribution(photo);
  return credit
    ? {
        photographer: credit.photographer,
        profileUrl: credit.profileUrl,
        photoUrl: credit.photoUrl,
      }
    : null;
}

/** The file's entries, or [] (with a log line) when it is missing or no array. */
function readArray(file: string, what: string): unknown[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    log.warn(
      `No sharepic ${what} at ${file} — check the Salt rollout. (${toError(error).message})`
    );
    return [];
  }
  if (!Array.isArray(raw)) {
    log.error(`${file} is not a JSON array`);
    return [];
  }
  return raw;
}

function loadCountry(locale: SharepicCreatorLocale): SharepicVorlage[] {
  const file = path.join(dir(), FILES[locale]);
  return readArray(file, 'Vorlagen').flatMap((item, i) => {
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
        attributions: parsed.data.spec.slides.map(attributionOf),
        thumbVersion: thumbVersionOf(
          parsed.data.spec.slides.map((_, i) =>
            path.join(dir(), 'thumbs', thumbName(parsed.data.id, i + 1))
          )
        ),
      },
    ];
  });
}

function loadSeiten(locale: SharepicCreatorLocale): SharepicSeite[] {
  const file = path.join(dir(), 'seiten', FILES[locale]);
  return readArray(file, 'Seiten').flatMap((item, i) => {
    const parsed = sharepicSeiteFileEntrySchema.safeParse(item);
    // The slide must also hold as a spec of the file's country (colours, markers).
    const asSpec = parsed.success
      ? sharepicSpecSchema.safeParse({ locale, slides: [parsed.data.slide] })
      : null;
    const issue = !parsed.success ? parsed.error.issues[0] : asSpec?.error?.issues[0];
    if (!parsed.success || !asSpec?.success) {
      log.error(`${file}[${i}] skipped: ${issue?.path.join('.')} ${issue?.message ?? 'invalid'}`);
      return [];
    }
    const { id, formats, slide } = parsed.data;
    return [
      {
        ...parsed.data,
        locale,
        attribution: attributionOf(slide),
        thumbVersion: thumbVersionOf(
          formats.map((format) => path.join(dir(), 'thumbs', 'seiten', seiteThumbName(id, format)))
        ),
      },
    ];
  });
}

const ITEM_TYP: Partial<Record<SharepicSlide['items'][number]['type'], SharepicSeiteTyp>> = {
  zitat: 'zitat',
  frage: 'frage',
  liste: 'liste',
  iconliste: 'liste',
  diagramm: 'diagramm',
  zahl: 'diagramm',
  rechnung: 'diagramm',
  vergleich: 'diagramm',
  infografik: 'diagramm',
  aufruf: 'aufruf',
  button: 'aufruf',
};

const typOf = (slide: SharepicSlide): SharepicSeiteTyp =>
  slide.items.map((item) => ITEM_TYP[item.type]).find((typ) => typ !== undefined) ?? 'text';

function rolleOf(n: number, count: number): SharepicSeiteRolle {
  if (n === 1) return 'titel';
  return n === count ? 'schluss' : 'inhalt';
}

/** Each slide of a Vorlage as a Seite in the Vorlage's format; `weiter` only fits a carousel. */
function seitenFromVorlage(vorlage: SharepicVorlage): { seite: SharepicSeite; thumb: string }[] {
  const { slides } = vorlage.spec;
  return slides.flatMap(({ weiter: _weiter, ...slide }, i) => {
    const n = i + 1;
    const id = `${vorlage.id}-s${n}`;
    if (!sharepicVorlageIdSchema.safeParse(id).success) {
      log.error(`Vorlage ${vorlage.id} slide ${n} skipped as a Seite: id ${id} too long`);
      return [];
    }
    const asSpec = sharepicSpecSchema.safeParse({ locale: vorlage.locale, slides: [slide] });
    if (!asSpec.success) {
      const issue = asSpec.error.issues[0];
      log.error(
        `Vorlage ${vorlage.id} slide ${n} skipped as a Seite: ${issue?.path.join('.')} ${issue?.message ?? 'invalid'}`
      );
      return [];
    }
    const thumb = path.join(dir(), 'thumbs', thumbName(vorlage.id, n));
    return [
      {
        seite: {
          id,
          titel: vorlage.titel,
          rolle: rolleOf(n, slides.length),
          typ: typOf(slide),
          // No format on the spec is the default one, as the editor reads it.
          formats: [vorlage.spec.format ?? 'post-portrait'],
          slide,
          quelle: { vorlage: vorlage.id, seite: n },
          locale: vorlage.locale,
          attribution: vorlage.attributions[i] ?? null,
          thumbVersion: thumbVersionOf([thumb]),
        },
        thumb,
      },
    ];
  });
}

/** The curated Seiten, then every Vorlage slide no curated Seite was taken from. */
function seitenWithVorlagen(
  curated: SharepicSeite[],
  vorlagen: SharepicVorlage[]
): Pick<Catalog, 'seiten' | 'derivedThumbs'> {
  const taken = new Set(
    curated.flatMap((s) => (s.quelle ? [`${s.quelle.vorlage}#${s.quelle.seite}`] : []))
  );
  const derived = vorlagen
    .flatMap(seitenFromVorlage)
    .filter(({ seite }) => !taken.has(`${seite.quelle!.vorlage}#${seite.quelle!.seite}`));
  const seiten = uniqueIds([...curated, ...derived.map((d) => d.seite)], 'Seite');
  const kept = new Set(seiten);
  return {
    seiten,
    derivedThumbs: new Map(
      derived.filter((d) => kept.has(d.seite)).map((d) => [d.seite.id, d.thumb])
    ),
  };
}

/** Drops (and logs) every entry whose id came earlier. */
function uniqueIds<T extends { id: string }>(entries: T[], what: string): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) {
      log.error(`Duplicate sharepic ${what} id "${entry.id}" skipped`);
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

function all(): Catalog {
  const now = Date.now();
  if (cache && now - checkedAt >= RECHECK_MS) {
    checkedAt = now;
    if (contentSignature() !== cacheSignature) cache = null;
  }
  if (!cache) {
    checkedAt = now;
    cacheSignature = contentSignature();
    const vorlagen = uniqueIds([...loadCountry('de-DE'), ...loadCountry('de-AT')], 'Vorlage');
    const curated = uniqueIds([...loadSeiten('de-DE'), ...loadSeiten('de-AT')], 'Seite');
    cache = { vorlagen, ...seitenWithVorlagen(curated, vorlagen) };
    log.info(
      `Loaded ${cache.vorlagen.length} sharepic Vorlage(n) and ${cache.seiten.length} Seite(n) from ${dir()}`
    );
  }
  return cache;
}

/** The country's Vorlagen, or both countries' when `locale` is null. */
export function listSharepicVorlagen(locale: SharepicCreatorLocale | null): SharepicVorlage[] {
  const { vorlagen } = all();
  return locale ? vorlagen.filter((v) => v.locale === locale) : vorlagen;
}

export function getSharepicVorlage(id: string): SharepicVorlage | null {
  return all().vorlagen.find((v) => v.id === id) ?? null;
}

/** The country's Seiten, or both countries' when `locale` is null. */
export function listSharepicSeiten(locale: SharepicCreatorLocale | null): SharepicSeite[] {
  const { seiten } = all();
  return locale ? seiten.filter((s) => s.locale === locale) : seiten;
}

export function getSharepicSeite(id: string): SharepicSeite | null {
  return all().seiten.find((s) => s.id === id) ?? null;
}

/**
 * Absolute path of a Seite's preview in one format, or null for an unknown id
 * or a format the Seite was not checked in. The file may still be missing.
 */
export function sharepicSeiteThumbFile(id: string, format: string): string | null {
  const parsed = sharepicFormatSchema.safeParse(format);
  const seite = getSharepicSeite(id);
  if (!parsed.success || !seite?.formats.includes(parsed.data)) return null;
  const derived = all().derivedThumbs.get(id);
  if (derived) return derived;
  return path.join(dir(), 'thumbs', 'seiten', seiteThumbName(id, parsed.data));
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

/**
 * Absolute path of a photo the catalogue ships (`vorlage:<file>`), or null for
 * a name that is no such file. The name is held to the ref's own pattern, so
 * no path leaves `assets/`.
 */
export function sharepicVorlageAssetFile(file: string): string | null {
  if (!SHAREPIC_VORLAGE_REF.test(`vorlage:${file}`)) return null;
  const assets = path.join(dir(), 'assets');
  const resolved = path.resolve(assets, file);
  if (!resolved.startsWith(assets + path.sep) || !existsSync(resolved)) return null;
  return resolved;
}

/** Tests only. */
export function resetSharepicVorlagenCache(): void {
  cache = null;
  cacheSignature = '';
  checkedAt = 0;
}
