import express, { type Request, type Response, type Router } from 'express';

import { PRIMARY_URL } from '../../config/domains.js';

// Use AUTH_BASE_URL for local dev (http://localhost:3001), PRIMARY_URL for production
const API_BASE_URL = process.env.AUTH_BASE_URL || PRIMARY_URL;

// GitHub configuration for release downloads
const GITHUB_REPO = 'netzbegruenung/Gruenerator';
const getGitHubReleaseTag = (version: string) => `desktop-v${version}`;
const getGitHubDownloadUrl = (version: string, filename: string) =>
  `https://github.com/${GITHUB_REPO}/releases/download/${getGitHubReleaseTag(version)}/${encodeURIComponent(filename)}`;

const router: Router = express.Router();

console.log('[Releases] Router initialized');

// Debug middleware to log all requests to this router - MUST be first
router.use((req: Request, _res: Response, next) => {
  console.log(
    `[Releases] Incoming request: ${req.method} ${req.path} (originalUrl: ${req.originalUrl})`
  );
  next();
});

interface PlatformConfig {
  signature: string;
  url: string;
}

interface UpdaterConfig {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, PlatformConfig>;
}

interface ReleaseAsset {
  id: number;
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseInfo {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  assets: ReleaseAsset[];
}

// Tauri Updater configuration - update these values when publishing new desktop releases
// This serves the latest.json format required by @tauri-apps/plugin-updater
const UPDATER_CONFIG: UpdaterConfig = {
  version: '1.0.1',
  notes: `See release notes at ${PRIMARY_URL}/releases`,
  pub_date: '2026-01-28T00:00:00Z',
  platforms: {
    'linux-x86_64': {
      signature: '',
      url: `${PRIMARY_URL}/api/releases/download/linux-x86_64`,
    },
    'darwin-x86_64': {
      signature: '',
      url: `${PRIMARY_URL}/api/releases/download/darwin-x86_64`,
    },
    'darwin-aarch64': {
      signature: '',
      url: `${PRIMARY_URL}/api/releases/download/darwin-aarch64`,
    },
    'windows-x86_64': {
      signature: '',
      url: `${PRIMARY_URL}/api/releases/download/windows-x86_64`,
    },
  },
};

// Platform to filename mapping for Tauri updater bundles
// Note: macOS tar.gz bundles don't include version number in Tauri v2
const PLATFORM_FILES: Record<string, (v: string) => string> = {
  'linux-x86_64': (v) => `Grunerator_${v}_amd64.AppImage`,
  'darwin-x86_64': () => `Grunerator_x64.app.tar.gz`,
  'darwin-aarch64': () => `Grunerator_aarch64.app.tar.gz`,
  'windows-x86_64': (v) => `Grunerator_${v}_x64-setup.exe`,
};

// Helper to generate file download URL
const getFileDownloadUrl = (filename: string) =>
  `${API_BASE_URL}/api/releases/download/file/${encodeURIComponent(filename)}`;

// Release configuration - update this when publishing new releases
const CURRENT_RELEASE: ReleaseInfo = {
  tag_name: 'desktop-v1.0.1',
  name: 'Grünerator Desktop v1.0.1',
  published_at: '2026-01-28T00:00:00Z',
  body: `## Desktop v1.0.1

### Neue Funktionen
- Sichere Desktop-Authentifizierung mit PKCE
- Verbesserte Token-Verwaltung
- Scanner und Protokollizer Features

### Installation
1. Lade die passende Datei für dein Betriebssystem herunter
2. Führe die Installation aus
3. Starte den Grünerator über das Desktop-Symbol
`,
  assets: [
    {
      id: 1,
      name: 'Grunerator_1.0.1_x64-setup.exe',
      browser_download_url: getFileDownloadUrl('Grunerator_1.0.1_x64-setup.exe'),
      size: 45000000,
    },
    {
      id: 2,
      name: 'Grunerator_1.0.1_x64_en-US.msi',
      browser_download_url: getFileDownloadUrl('Grunerator_1.0.1_x64_en-US.msi'),
      size: 42000000,
    },
    {
      id: 3,
      name: 'Grunerator_1.0.1_x64.dmg',
      browser_download_url: getFileDownloadUrl('Grunerator_1.0.1_x64.dmg'),
      size: 48000000,
    },
    {
      id: 4,
      name: 'Grunerator_1.0.1_aarch64.dmg',
      browser_download_url: getFileDownloadUrl('Grunerator_1.0.1_aarch64.dmg'),
      size: 48000000,
    },
    {
      id: 5,
      name: 'Grunerator_1.0.1_amd64.AppImage',
      browser_download_url: getFileDownloadUrl('Grunerator_1.0.1_amd64.AppImage'),
      size: 85000000,
    },
    {
      id: 6,
      name: 'Grunerator_1.0.1_amd64.deb',
      browser_download_url: getFileDownloadUrl('Grunerator_1.0.1_amd64.deb'),
      size: 44000000,
    },
  ],
};

// GET /api/releases/latest - Get latest release info (for frontend download page)
router.get('/latest', (_req: Request, res: Response) => {
  res.json(CURRENT_RELEASE);
});

// GET /api/releases - Get all releases (currently just latest)
router.get('/', (_req: Request, res: Response) => {
  res.json([CURRENT_RELEASE]);
});

// GET /api/releases/updater/latest.json - Tauri updater manifest
router.get('/updater/latest.json', (_req: Request, res: Response) => {
  res.json(UPDATER_CONFIG);
});

// GET /api/releases/download/file/:filename - Redirect to GitHub release file (for direct downloads)
// IMPORTANT: This route must come BEFORE /download/:platform to avoid :platform matching "file"
router.get('/download/file/:filename', (req: Request<{ filename: string }>, res: Response) => {
  const { filename } = req.params;
  const version = UPDATER_CONFIG.version;

  // Security: only allow alphanumeric, dots, underscores, and hyphens in filename
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const githubUrl = getGitHubDownloadUrl(version, filename);
  console.log(`[Releases] Redirecting file download to GitHub: ${githubUrl}`);
  res.redirect(302, githubUrl);
});

// GET /api/releases/download/:platform - Redirect to GitHub release for platform (Tauri updater)
router.get('/download/:platform', (req: Request<{ platform: string }>, res: Response) => {
  const { platform } = req.params;
  const version = UPDATER_CONFIG.version;

  const fileNameFn = PLATFORM_FILES[platform];
  if (!fileNameFn) {
    console.log(`[Releases] Platform not found: ${platform}`);
    res.status(404).json({ error: 'Platform not found' });
    return;
  }

  const fileName = fileNameFn(version);
  const githubUrl = getGitHubDownloadUrl(version, fileName);
  console.log(`[Releases] Redirecting ${platform} to GitHub: ${githubUrl}`);
  res.redirect(302, githubUrl);
});

// GET /api/releases/download/:platform/signature - Get signature for platform (from config)
router.get('/download/:platform/signature', (req: Request<{ platform: string }>, res: Response) => {
  const { platform } = req.params;

  const platformConfig = UPDATER_CONFIG.platforms[platform];
  if (!platformConfig) {
    return res.status(404).json({ error: 'Platform not found' });
  }

  // Return signature from config (must be populated when creating releases)
  return res.type('text/plain').send(platformConfig.signature || '');
});

// GET /api/releases/info - Get release configuration info (for debugging)
router.get('/info', (_req: Request, res: Response) => {
  const version = UPDATER_CONFIG.version;
  const releaseTag = getGitHubReleaseTag(version);

  res.json({
    version,
    github: {
      repo: GITHUB_REPO,
      releaseTag,
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${releaseTag}`,
    },
    platformFiles: Object.entries(PLATFORM_FILES).map(([platform, fn]) => {
      const fileName = fn(version);
      return {
        platform,
        fileName,
        downloadUrl: getGitHubDownloadUrl(version, fileName),
      };
    }),
    frontendAssets: CURRENT_RELEASE.assets.map((asset) => ({
      name: asset.name,
      downloadUrl: getGitHubDownloadUrl(version, asset.name),
    })),
  });
});

// Debug: List all registered routes
console.log('[Releases] Registered routes:');
router.stack.forEach((r: any) => {
  if (r.route) {
    console.log(`[Releases]   ${Object.keys(r.route.methods).join(',')} ${r.route.path}`);
  }
});

export default router;
