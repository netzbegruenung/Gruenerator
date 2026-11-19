import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { brandFontFileSchema, type SupportedLocale } from '@gruenerator/contracts';
import {
  siteFontFaceCss,
  siteFontFiles,
  type RenderSitePageInput,
} from '@gruenerator/sites-design/server';

import { brandFontPath } from '../../../services/fonts/brandFonts.js';

import { cspHash } from './siteSecurity.js';

export type SiteFontFile = Parameters<RenderSitePageInput['fontUrl']>[0];

export function siteFontUrl(file: SiteFontFile): string {
  return `/_site/fonts/${file}`;
}

export interface SiteAsset {
  name: 'site' | 'consent';
  version: string;
  href: string;
  body: Buffer;
  contentType: string;
}

export interface SiteAssetPaths {
  css: string;
  consent: string;
  bundledFontsDir: string;
}

export interface SiteAssets {
  stylesheet: SiteAsset;
  consent: SiteAsset;
  fontPath(file: string): string | null;
  styleHash(locale: SupportedLocale): string;
}

function loadAsset(name: SiteAsset['name'], path: string): SiteAsset {
  const body = readFileSync(path);
  const version = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const css = name === 'site';
  return {
    name,
    version,
    href: `/_site/${name}.${version}.${css ? 'css' : 'js'}`,
    body,
    contentType: css ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
  };
}

export function createSiteAssets(paths: SiteAssetPaths): SiteAssets {
  const stylesheet = loadAsset('site', paths.css);
  const consent = loadAsset('consent', paths.consent);
  const allowed = new Set<string>([...siteFontFiles('de-DE'), ...siteFontFiles('de-AT')]);
  const hashes: Record<SupportedLocale, string> = {
    'de-DE': cspHash(siteFontFaceCss('de-DE', siteFontUrl)),
    'de-AT': cspHash(siteFontFaceCss('de-AT', siteFontUrl)),
  };

  return {
    stylesheet,
    consent,
    fontPath(file) {
      if (!allowed.has(file)) return null;
      const brand = brandFontFileSchema.safeParse(file);
      const resolved = brand.success
        ? brandFontPath(brand.data)
        : join(paths.bundledFontsDir, file);
      return existsSync(resolved) ? resolved : null;
    },
    styleHash: (locale) => hashes[locale],
  };
}

export function defaultSiteAssetPaths(): SiteAssetPaths {
  const resolve = createRequire(import.meta.url).resolve;
  return {
    css: resolve('@gruenerator/sites-design/site.css'),
    consent: resolve('@gruenerator/sites-design/consent.js'),
    bundledFontsDir: dirname(resolve('@gruenerator/sites-design/fonts/PTSans-Regular.woff2')),
  };
}
