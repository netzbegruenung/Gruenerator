import express, { type Request, type Response, type Router } from 'express';
import { z } from 'zod';

import { PRIMARY_URL } from '../../config/domains.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

const log = createLogger('releases');

// Desktop releases are published as GitHub Releases (tag `desktop-v<version>`).
// This router derives everything — the download page, the per-channel download
// manifests, and the Tauri updater feed — from the GitHub Releases API at
// runtime, cached in Redis. Publishing a new release (stable or pre-release)
// updates the website and the auto-updater automatically; no code edit/redeploy.
const GITHUB_REPO = 'netzbegruenung/Gruenerator';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`;

const FRESH_TTL_SECONDS = 600; // serve cached release data for 10 min
const STALE_TTL_SECONDS = 21_600; // fall back to 6h-old data if GitHub is unreachable

const FRESH_CACHE_KEY = 'releases:gh:fresh';
const STALE_CACHE_KEY = 'releases:gh:stale';
const UPDATER_CACHE_KEY = 'releases:updater:latest';

// --- GitHub API shapes (validated at the boundary) -------------------------
const GithubAssetSchema = z.object({
  id: z.number(),
  name: z.string(),
  browser_download_url: z.string().url(),
  size: z.number(),
});
const GithubReleaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  published_at: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(GithubAssetSchema),
});
const GithubReleasesSchema = z.array(GithubReleaseSchema);
type GithubRelease = z.infer<typeof GithubReleaseSchema>;

// --- Response shapes -------------------------------------------------------
const PlatformConfigSchema = z.object({ signature: z.string(), url: z.string() });
const UpdaterConfigSchema = z.object({
  version: z.string(),
  notes: z.string(),
  pub_date: z.string(),
  platforms: z.record(z.string(), PlatformConfigSchema),
});
type UpdaterConfig = z.infer<typeof UpdaterConfigSchema>;

const versionFromTag = (tag: string): string => tag.replace(/^desktop-v/, '');

// First non-empty line of the release body — a short blurb for the UI, not the
// full markdown changelog.
const shortNotes = (body: string | null): string => {
  if (!body) return '';
  const firstLine = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return '';
  return firstLine.length > 280 ? `${firstLine.slice(0, 277)}…` : firstLine;
};

// --- GitHub fetch + cache --------------------------------------------------
async function fetchReleases(): Promise<GithubRelease[]> {
  const cached = await getCachedJson(FRESH_CACHE_KEY, GithubReleasesSchema);
  if (cached) return cached;

  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'gruenerator-releases',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
    const parsed = GithubReleasesSchema.parse(await res.json());
    await setCachedJson(FRESH_CACHE_KEY, parsed, FRESH_TTL_SECONDS);
    await setCachedJson(STALE_CACHE_KEY, parsed, STALE_TTL_SECONDS);
    return parsed;
  } catch (error) {
    log.warn(
      `GitHub releases fetch failed (${(error as Error).message}); falling back to stale cache`
    );
    const stale = await getCachedJson(STALE_CACHE_KEY, GithubReleasesSchema);
    if (stale) return stale;
    throw error;
  }
}

const latestStable = (releases: GithubRelease[]): GithubRelease | null =>
  releases.find((r) => !r.draft && !r.prerelease) ?? null;
const latestBeta = (releases: GithubRelease[]): GithubRelease | null =>
  releases.find((r) => !r.draft && r.prerelease) ?? null;

// --- Per-channel download manifest (macOS DMGs) ----------------------------
// The website's download UI is macOS-only; map the two DMG assets to stable
// platform keys the frontend renders. Discovered from the release's assets.
const MAC_PLATFORMS: ReadonlyArray<{
  key: string;
  label: string;
  matches: (name: string) => boolean;
}> = [
  { key: 'mac-aarch64', label: 'Apple Silicon (M1–M4)', matches: (n) => /aarch64\.dmg$/i.test(n) },
  { key: 'mac-intel', label: 'Intel', matches: (n) => /(x64|x86_64)\.dmg$/i.test(n) },
];

interface ReleaseManifest {
  version: string;
  name: string;
  notes: string;
  publishedAt: string;
  platforms: Record<string, { label: string; filename: string }>;
}

function buildManifest(release: GithubRelease): ReleaseManifest {
  const platforms: ReleaseManifest['platforms'] = {};
  for (const platform of MAC_PLATFORMS) {
    const asset = release.assets.find((a) => platform.matches(a.name));
    if (asset) platforms[platform.key] = { label: platform.label, filename: asset.name };
  }
  return {
    version: versionFromTag(release.tag_name),
    name: release.name ?? release.tag_name,
    notes: shortNotes(release.body),
    publishedAt: release.published_at ?? '',
    platforms,
  };
}

// --- Tauri updater manifest (built from the latest stable release) ---------
// Each updater target maps to its bundle asset + a sibling `<asset>.sig` whose
// contents are the minisign signature. Tauri v2 omits the version from the
// macOS `.app.tar.gz` name.
const UPDATER_TARGETS: ReadonlyArray<{ key: string; matches: (name: string) => boolean }> = [
  { key: 'darwin-aarch64', matches: (n) => /_aarch64\.app\.tar\.gz$/i.test(n) },
  { key: 'darwin-x86_64', matches: (n) => /_x64\.app\.tar\.gz$/i.test(n) },
  {
    key: 'linux-x86_64',
    matches: (n) => /\.AppImage\.tar\.gz$/i.test(n) || /amd64\.AppImage$/i.test(n),
  },
  { key: 'windows-x86_64', matches: (n) => /-setup\.nsis\.zip$/i.test(n) },
];

async function fetchSignature(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'gruenerator-releases' } });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

async function buildUpdaterConfig(release: GithubRelease): Promise<UpdaterConfig | null> {
  const platforms: UpdaterConfig['platforms'] = {};
  for (const target of UPDATER_TARGETS) {
    const artifact = release.assets.find((a) => !a.name.endsWith('.sig') && target.matches(a.name));
    if (!artifact) continue;
    const sigAsset = release.assets.find((a) => a.name === `${artifact.name}.sig`);
    if (!sigAsset) continue;
    const signature = await fetchSignature(sigAsset.browser_download_url);
    if (!signature) {
      log.warn(`Updater signature missing/empty for ${artifact.name}; skipping ${target.key}`);
      continue;
    }
    platforms[target.key] = { signature, url: artifact.browser_download_url };
  }
  if (Object.keys(platforms).length === 0) return null;
  return {
    version: versionFromTag(release.tag_name),
    notes: `See release notes at ${PRIMARY_URL}/apps`,
    pub_date: release.published_at ?? '',
    platforms,
  };
}

async function getUpdaterConfig(): Promise<UpdaterConfig | null> {
  const cached = await getCachedJson(UPDATER_CACHE_KEY, UpdaterConfigSchema);
  if (cached) return cached;
  const stable = latestStable(await fetchReleases());
  if (!stable) return null;
  const config = await buildUpdaterConfig(stable);
  if (config) await setCachedJson(UPDATER_CACHE_KEY, config, FRESH_TTL_SECONDS);
  return config;
}

// --- Router ----------------------------------------------------------------
const router: Router = express.Router();

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) => {
    handler(req, res).catch((error: unknown) => {
      log.error(`Releases route failed: ${(error as Error).message}`);
      if (!res.headersSent) res.status(503).json({ error: 'Release data temporarily unavailable' });
    });
  };

// 302-redirect to the GitHub asset for a channel + platform key.
const channelDownload = (pick: (releases: GithubRelease[]) => GithubRelease | null) =>
  asyncRoute(async (req, res) => {
    const release = pick(await fetchReleases());
    if (!release) {
      res.status(404).json({ error: 'No release available' });
      return;
    }
    const entry = buildManifest(release).platforms[req.params.platform as string];
    const asset = entry && release.assets.find((a) => a.name === entry.filename);
    if (!asset) {
      res.status(404).json({ error: 'Platform not found' });
      return;
    }
    res.redirect(302, asset.browser_download_url);
  });

// Channel manifest (download-only) for the stable / beta UI sections.
const channelManifest = (pick: (releases: GithubRelease[]) => GithubRelease | null) =>
  asyncRoute(async (_req, res) => {
    const release = pick(await fetchReleases());
    if (!release) {
      res.status(404).json({ error: 'No release available' });
      return;
    }
    res.json(buildManifest(release));
  });

// GET /api/releases/latest — latest stable release (download page shape)
router.get(
  '/latest',
  asyncRoute(async (_req, res) => {
    const release = latestStable(await fetchReleases());
    if (!release) {
      res.status(404).json({ error: 'No release available' });
      return;
    }
    res.json({
      tag_name: release.tag_name,
      name: release.name ?? release.tag_name,
      published_at: release.published_at ?? '',
      body: release.body ?? '',
      assets: release.assets.map((a) => ({
        id: a.id,
        name: a.name,
        browser_download_url: a.browser_download_url,
        size: a.size,
      })),
    });
  })
);

// GET /api/releases — all (currently just the latest stable)
router.get(
  '/',
  asyncRoute(async (_req, res) => {
    const release = latestStable(await fetchReleases());
    res.json(release ? [release] : []);
  })
);

// GET /api/releases/stable — latest stable channel manifest
router.get('/stable', channelManifest(latestStable));
// GET /api/releases/stable/download/:platform — redirect to the stable asset
router.get('/stable/download/:platform', channelDownload(latestStable));

// GET /api/releases/beta — latest pre-release channel manifest
router.get('/beta', channelManifest(latestBeta));
// GET /api/releases/beta/download/:platform — redirect to the pre-release asset
router.get('/beta/download/:platform', channelDownload(latestBeta));

// GET /api/releases/updater/latest.json — Tauri updater feed (latest stable).
// 204 = "no update available" (Tauri's signal) when nothing can be served.
router.get(
  '/updater/latest.json',
  asyncRoute(async (_req, res) => {
    const config = await getUpdaterConfig();
    if (!config) {
      res.status(204).end();
      return;
    }
    res.json(config);
  })
);

// GET /api/releases/info — debug snapshot
router.get(
  '/info',
  asyncRoute(async (_req, res) => {
    const releases = await fetchReleases();
    const stable = latestStable(releases);
    const beta = latestBeta(releases);
    res.json({
      repo: GITHUB_REPO,
      stable: stable ? { tag: stable.tag_name, assets: stable.assets.map((a) => a.name) } : null,
      beta: beta ? { tag: beta.tag_name, assets: beta.assets.map((a) => a.name) } : null,
    });
  })
);

export default router;
