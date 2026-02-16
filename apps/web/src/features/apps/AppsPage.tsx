import { useState, useEffect, useCallback, useMemo } from 'react';
import { FaWindows, FaApple, FaLinux } from 'react-icons/fa';
import { HiDownload, HiRefresh } from 'react-icons/hi';

import Spinner from '../../components/common/Spinner';

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
    if (lower.includes('.exe')) return 'Download für Windows';
    if (lower.includes('.msi')) return 'Download für Windows';
  }
  if (platform === 'macos') {
    const arch = getAssetArchitecture(filename);
    if (arch === 'arm64') return 'Download für Apple Silicon';
    return 'Download für Intel';
  }
  if (platform === 'linux') {
    if (lower.includes('.appimage')) return 'Download für Linux';
    if (lower.includes('.deb')) return 'Download für Linux';
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="medium" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold text-foreground-heading">Download Grünerator</h1>
        <p className="text-error">{error}</p>
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
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold text-foreground-heading">Download Grünerator</h1>
        <p className="text-grey-500">Keine Releases verfügbar.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center px-4 py-12">
      {/* Hero heading */}
      <h1 className="mb-6 text-center text-2xl font-bold text-foreground-heading">
        Download Grünerator
      </h1>

      {/* Platform tabs */}
      <div className="mb-8 flex gap-2">
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
    </div>
  );
};

export default AppsPage;
