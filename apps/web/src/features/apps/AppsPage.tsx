import { useState, useEffect, useCallback, useMemo } from 'react';
import { FaWindows, FaApple, FaLinux } from 'react-icons/fa';
import { HiDownload, HiRefresh, HiClipboardCopy, HiCheck, HiExternalLink } from 'react-icons/hi';

import Spinner from '../../components/common/Spinner';
import { getDocsUrl } from '../../utils/docsUrl';

import { cn } from '@/utils/cn';

// Type augmentation for Navigator with userAgentData
interface NavigatorUAData {
  platform?: string;
  architecture?: string;
}

declare global {
  interface Navigator {
    userAgentData?: NavigatorUAData;
  }
}

const RELEASES_API_URL = `${import.meta.env.VITE_API_BASE_URL || '/api'}/releases/latest`;
const MCP_URL = 'https://mcp.gruenerator.eu/mcp';

const CONNECT_PLATFORMS = [
  {
    name: 'ChatGPT',
    path: 'Settings \u2192 Connectors (Developer Mode)',
    note: 'Plus, Pro oder Team Plan',
  },
  { name: 'Claude', path: 'Settings \u2192 Integrations', note: null },
  { name: 'Mistral Le Chat', path: 'Settings \u2192 Connectors \u2192 Custom MCP', note: null },
  { name: 'OpenWebUI', path: 'Settings \u2192 Tools \u2192 MCP Servers', note: 'ab Version 0.6' },
];

type Platform = 'windows' | 'macos' | 'linux';

const detectPlatform = (): Platform => {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  if (userAgent.includes('win') || platform.includes('win')) {
    return 'windows';
  }
  if (userAgent.includes('mac') || platform.includes('mac')) {
    return 'macos';
  }
  if (userAgent.includes('linux') || platform.includes('linux')) {
    return 'linux';
  }
  return 'windows';
};

const detectArchitecture = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  if (platform.includes('mac') || userAgent.includes('mac')) {
    if (navigator.userAgentData?.platform === 'macOS') {
      const arch = navigator.userAgentData?.architecture;
      if (arch === 'arm') return 'arm64';
    }

    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl') ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = (
            (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string
          ).toLowerCase();
          if (renderer.includes('apple m') || renderer.includes('apple gpu')) {
            return 'arm64';
          }
        }
      }
    } catch {
      // WebGL not available
    }

    return 'x64';
  }

  if (platform.includes('win')) {
    if (userAgent.includes('arm64') || userAgent.includes('aarch64')) {
      return 'arm64';
    }
    return 'x64';
  }

  if (platform.includes('linux')) {
    if (userAgent.includes('aarch64') || userAgent.includes('arm64')) {
      return 'arm64';
    }
    return 'x64';
  }

  return 'x64';
};

const formatSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
};

const getAssetArchitecture = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.includes('aarch64') || lower.includes('arm64')) return 'arm64';
  if (lower.includes('x64') || lower.includes('x86_64') || lower.includes('amd64')) return 'x64';
  return 'x64';
};

const getDownloadLabel = (filename: string, platform: Platform): string => {
  const lower = filename.toLowerCase();

  if (platform === 'windows') {
    if (lower.includes('.exe')) return 'Download f\u00fcr Windows';
    if (lower.includes('.msi')) return 'Download f\u00fcr Windows';
  }
  if (platform === 'macos') {
    const arch = getAssetArchitecture(filename);
    if (arch === 'arm64') return 'Download f\u00fcr Apple Silicon';
    return 'Download f\u00fcr Intel';
  }
  if (platform === 'linux') {
    if (lower.includes('.appimage')) return 'Download f\u00fcr Linux';
    if (lower.includes('.deb')) return 'Download f\u00fcr Linux';
  }
  return 'Download';
};

const getSecondaryLabel = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.includes('.msi')) return '.msi';
  if (lower.includes('.exe')) return '.exe';
  if (lower.includes('.deb')) return '.deb';
  if (lower.includes('.appimage')) return 'AppImage';
  if (lower.includes('.dmg') && lower.includes('aarch64')) return 'Apple Silicon (.dmg)';
  if (lower.includes('.dmg') && lower.includes('x64')) return 'Intel (.dmg)';
  if (lower.includes('.dmg')) return '.dmg';
  return filename;
};

interface ReleaseAsset {
  id?: number | string;
  name: string;
  browser_download_url: string;
  size: number;
}

interface CategorizedAssets {
  windows: ReleaseAsset[];
  macos: ReleaseAsset[];
  linux: ReleaseAsset[];
}

const categorizeAssets = (assets: ReleaseAsset[] | undefined): CategorizedAssets => {
  if (!assets) return { windows: [], macos: [], linux: [] };

  return {
    windows: assets.filter((a: ReleaseAsset) => /\.(exe|msi)$/i.test(a.name)),
    macos: assets.filter(
      (a: ReleaseAsset) =>
        /\.dmg$/i.test(a.name) ||
        a.name.toLowerCase().includes('darwin') ||
        a.name.toLowerCase().includes('macos')
    ),
    linux: assets.filter((a: ReleaseAsset) => /\.(appimage|deb|rpm)$/i.test(a.name)),
  };
};

interface GitHubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

const PLATFORM_TABS: { key: Platform; label: string; icon: typeof FaWindows }[] = [
  { key: 'macos', label: 'macOS', icon: FaApple },
  { key: 'linux', label: 'Linux', icon: FaLinux },
  { key: 'windows', label: 'Windows', icon: FaWindows },
];

function selectPrimaryAsset(
  assets: ReleaseAsset[],
  platform: Platform,
  architecture: string
): ReleaseAsset | null {
  if (assets.length === 0) return null;
  if (assets.length === 1) return assets[0];

  if (platform === 'windows') {
    return assets.find((a) => /\.exe$/i.test(a.name)) || assets[0];
  }

  if (platform === 'macos') {
    const archMatch = assets.find((a) => getAssetArchitecture(a.name) === architecture);
    return archMatch || assets[0];
  }

  if (platform === 'linux') {
    return assets.find((a) => /\.appimage$/i.test(a.name)) || assets[0];
  }

  return assets[0];
}

const ConnectSection = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  };

  return (
    <section className="flex w-full max-w-[40rem] flex-col items-center gap-6">
      <h2 className="text-xl font-bold text-foreground-heading">Mit KI-Chat verbinden</h2>
      <p className="text-center text-sm text-grey-600 dark:text-grey-400">
        Du kannst den Grünerator direkt in ChatGPT, Claude, Mistral Le Chat oder OpenWebUI
        verwenden. Dein KI-Assistent kann dann grüne Parteiprogramme durchsuchen und dir beim
        Erstellen politischer Texte helfen.
      </p>

      {/* MCP URL with copy button */}
      <div className="flex w-full items-center gap-2 rounded-lg border border-grey-200 bg-background-alt px-4 py-3 dark:border-grey-700">
        <code className="min-w-0 flex-1 truncate text-sm text-foreground">{MCP_URL}</code>
        <button
          onClick={handleCopy}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            copied
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-grey-100 text-grey-600 hover:bg-grey-200 dark:bg-grey-800 dark:text-grey-300 dark:hover:bg-grey-700'
          )}
        >
          {copied ? (
            <>
              <HiCheck className="text-sm" />
              Kopiert
            </>
          ) : (
            <>
              <HiClipboardCopy className="text-sm" />
              Kopieren
            </>
          )}
        </button>
      </div>

      {/* Platform cards */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {CONNECT_PLATFORMS.map((platform) => (
          <div
            key={platform.name}
            className="rounded-lg border border-grey-200 bg-background-alt p-4 dark:border-grey-700"
          >
            <p className="text-sm font-semibold text-foreground-heading">{platform.name}</p>
            <p className="mt-1 text-xs text-grey-500 dark:text-grey-400">{platform.path}</p>
            {platform.note && (
              <p className="mt-1 text-xs text-grey-400 italic dark:text-grey-500">
                {platform.note}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Link to full docs */}
      <a
        href={`${getDocsUrl()}/docs/integrationen/ki-chat-einrichten`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-link underline underline-offset-2 hover:opacity-80"
      >
        Ausführliche Einrichtungsanleitung
        <HiExternalLink className="text-sm" />
      </a>
    </section>
  );
};

const AppsPage = () => {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('windows');

  const currentPlatform = useMemo(() => detectPlatform(), []);
  const currentArchitecture = useMemo(() => detectArchitecture(), []);

  useEffect(() => {
    setSelectedPlatform(currentPlatform);
  }, [currentPlatform]);

  const fetchRelease = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(RELEASES_API_URL);

      if (!response.ok) {
        throw new Error('Fehler beim Laden der Release-Informationen.');
      }

      const data = await response.json();
      setRelease(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein unbekannter Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRelease();
  }, [fetchRelease]);

  const categorizedAssets = useMemo(() => categorizeAssets(release?.assets), [release?.assets]);

  const selectedAssets = categorizedAssets[selectedPlatform] || [];
  const primaryAsset = useMemo(
    () => selectPrimaryAsset(selectedAssets, selectedPlatform, currentArchitecture),
    [selectedAssets, selectedPlatform, currentArchitecture]
  );
  const secondaryAssets = useMemo(
    () => selectedAssets.filter((a) => a !== primaryAsset),
    [selectedAssets, primaryAsset]
  );

  const renderDesktopContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Spinner size="medium" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center gap-3 py-4">
          <p className="text-error text-sm">{error}</p>
          <button
            onClick={fetchRelease}
            className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2 text-sm text-white transition-opacity hover:opacity-90"
          >
            <HiRefresh />
            Erneut versuchen
          </button>
        </div>
      );
    }

    if (!release) {
      return <p className="py-4 text-sm text-grey-500">Keine Releases verfügbar.</p>;
    }

    return (
      <>
        {/* Platform tabs */}
        <div className="mb-6 flex gap-2">
          {PLATFORM_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSelectedPlatform(key)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                selectedPlatform === key
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-grey-200 bg-background text-foreground hover:border-grey-400'
              )}
            >
              <Icon className="text-lg" />
              {label}
            </button>
          ))}
        </div>

        {/* Primary download */}
        {primaryAsset ? (
          <div className="flex flex-col items-center gap-3">
            <a
              href={primaryAsset.browser_download_url}
              download
              className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
            >
              <HiDownload />
              {getDownloadLabel(primaryAsset.name, selectedPlatform)}
            </a>

            {/* Secondary downloads */}
            {secondaryAssets.length > 0 && (
              <p className="text-xs text-grey-500">
                Auch verfügbar als{' '}
                {secondaryAssets.map((asset, i) => (
                  <span key={asset.id || asset.name}>
                    {i > 0 && ', '}
                    <a
                      href={asset.browser_download_url}
                      download
                      className="text-link underline underline-offset-2 hover:opacity-80"
                    >
                      {getSecondaryLabel(asset.name)}
                    </a>
                    <span className="text-grey-400"> ({formatSize(asset.size)})</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-grey-500">Keine Downloads für diese Plattform verfügbar.</p>
        )}
      </>
    );
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center px-4 py-12">
      {/* Page heading */}
      <h1 className="mb-2 text-center text-2xl font-bold text-foreground-heading">
        Apps & Connect
      </h1>
      <p className="mb-10 text-center text-sm text-grey-500">
        Desktop-App herunterladen oder den Grünerator mit deinem KI-Chat verbinden.
      </p>

      {/* Desktop App Section */}
      <section className="flex w-full flex-col items-center">
        <h2 className="mb-6 text-lg font-bold text-foreground-heading">Desktop-App</h2>
        {renderDesktopContent()}
      </section>

      {/* Divider */}
      <hr className="my-12 w-full max-w-[40rem] border-grey-200 dark:border-grey-700" />

      {/* Connect Section */}
      <ConnectSection />
    </div>
  );
};

export default AppsPage;
