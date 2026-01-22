import express, { Request, Response, Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router: Router = express.Router();

// Release files directory - create this on your server
// Place release bundles here: /var/www/gruenerator/releases/desktop/v{version}/
const RELEASES_DIR = process.env.RELEASES_DIR || path.join(__dirname, '..', '..', 'releases');

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
  version: '1.0.0',
  notes: 'See release notes at https://gruenerator.de/releases',
  pub_date: '2024-12-31T12:00:00Z',
  platforms: {
    'linux-x86_64': {
      signature: '',
      url: 'https://gruenerator.de/api/releases/download/linux-x86_64'
    },
    'darwin-x86_64': {
      signature: '',
      url: 'https://gruenerator.de/api/releases/download/darwin-x86_64'
    },
    'darwin-aarch64': {
      signature: '',
      url: 'https://gruenerator.de/api/releases/download/darwin-aarch64'
    },
    'windows-x86_64': {
      signature: '',
      url: 'https://gruenerator.de/api/releases/download/windows-x86_64'
    }
  }
};

// Platform to filename mapping
const PLATFORM_FILES: Record<string, (v: string) => string> = {
  'linux-x86_64': (v) => `gruenerator_${v}_amd64.AppImage.tar.gz`,
  'darwin-x86_64': (v) => `Gruenerator_${v}_x64.app.tar.gz`,
  'darwin-aarch64': (v) => `Gruenerator_${v}_aarch64.app.tar.gz`,
  'windows-x86_64': (v) => `Gruenerator_${v}_x64-setup.nsis.zip`
};

// Release configuration - update this when publishing new releases
const CURRENT_RELEASE: ReleaseInfo = {
  tag_name: 'v1.0.0',
  name: 'Grünerator Desktop v1.0.0',
  published_at: '2024-12-31T12:00:00Z',
  body: `## Erste Desktop-Version

Die Grünerator Desktop-App ist da! Mit dieser Version kannst du den Grünerator direkt auf deinem Computer nutzen.

### Neue Funktionen
- Schnellerer Zugriff auf alle Grünerator-Funktionen
- Offline-Unterstützung für grundlegende Funktionen
- Native Desktop-Integration

### Installation
1. Lade die passende Datei für dein Betriebssystem herunter
2. Führe die Installation aus
3. Starte den Grünerator über das Desktop-Symbol
`,
  assets: [
    {
      id: 1,
      name: 'Gruenerator_1.0.0_x64-setup.exe',
      browser_download_url: 'https://github.com/netzbegruenung/Gruenerator/releases/download/v1.0.0/Gruenerator_1.0.0_x64-setup.exe',
      size: 45000000
    },
    {
      id: 2,
      name: 'Gruenerator_1.0.0_x64_en-US.msi',
      browser_download_url: 'https://github.com/netzbegruenung/Gruenerator/releases/download/v1.0.0/Gruenerator_1.0.0_x64_en-US.msi',
      size: 42000000
    },
    {
      id: 3,
      name: 'Gruenerator_1.0.0_x64.dmg',
      browser_download_url: 'https://github.com/netzbegruenung/Gruenerator/releases/download/v1.0.0/Gruenerator_1.0.0_x64.dmg',
      size: 48000000
    },
    {
      id: 4,
      name: 'Gruenerator_1.0.0_amd64.AppImage',
      browser_download_url: 'https://github.com/netzbegruenung/Gruenerator/releases/download/v1.0.0/Gruenerator_1.0.0_amd64.AppImage',
      size: 85000000
    },
    {
      id: 5,
      name: 'Gruenerator_1.0.0_amd64.deb',
      browser_download_url: 'https://github.com/netzbegruenung/Gruenerator/releases/download/v1.0.0/Gruenerator_1.0.0_amd64.deb',
      size: 44000000
    }
  ]
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

// GET /api/releases/download/:platform - Serve release file for platform
router.get('/download/:platform', (req: Request, res: Response) => {
  const { platform } = req.params;
  const version = UPDATER_CONFIG.version;

  const fileNameFn = PLATFORM_FILES[platform];
  if (!fileNameFn) {
    return res.status(404).json({ error: 'Platform not found' });
  }

  const fileName = fileNameFn(version);
  const filePath = path.join(RELEASES_DIR, 'desktop', `v${version}`, fileName);

  if (!fs.existsSync(filePath)) {
    console.error(`[Releases] File not found: ${filePath}`);
    return res.status(404).json({
      error: 'Release file not found',
      expected: filePath,
      hint: `Upload the file to: ${RELEASES_DIR}/desktop/v${version}/${fileName}`
    });
  }

  const stats = fs.statSync(filePath);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', stats.size);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    console.error(`[Releases] Error streaming file: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error streaming file' });
    }
  });
});

// GET /api/releases/download/:platform/signature - Get signature for platform
router.get('/download/:platform/signature', (req: Request, res: Response) => {
  const { platform } = req.params;
  const version = UPDATER_CONFIG.version;

  const fileNameFn = PLATFORM_FILES[platform];
  if (!fileNameFn) {
    return res.status(404).json({ error: 'Platform not found' });
  }

  const fileName = fileNameFn(version) + '.sig';
  const filePath = path.join(RELEASES_DIR, 'desktop', `v${version}`, fileName);

  if (!fs.existsSync(filePath)) {
    const signature = UPDATER_CONFIG.platforms[platform]?.signature || '';
    return res.type('text/plain').send(signature);
  }

  return res.type('text/plain').sendFile(filePath);
});

// GET /api/releases/info - Get release directory info (for debugging)
router.get('/info', (_req: Request, res: Response) => {
  const version = UPDATER_CONFIG.version;
  const versionDir = path.join(RELEASES_DIR, 'desktop', `v${version}`);

  let files: string[] = [];
  if (fs.existsSync(versionDir)) {
    files = fs.readdirSync(versionDir);
  }

  res.json({
    version,
    releasesDir: RELEASES_DIR,
    versionDir,
    files,
    expectedFiles: Object.entries(PLATFORM_FILES).map(([platform, fn]) => ({
      platform,
      fileName: fn(version)
    }))
  });
});

export default router;
