import React, { useState, useEffect, useCallback } from 'react';
import { FaWindows, FaApple, FaLinux } from 'react-icons/fa';
import { HiDownload, HiRefresh } from 'react-icons/hi';
import ReactMarkdown from 'react-markdown';
import '../../assets/styles/pages/Impressum_datenschutz.css';
import '../../assets/styles/components/ui/button.css';
import './AppsPage.css';

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

const RELEASES_API_URL = `${import.meta.env.VITE_API_BASE_URL || ''}/api/releases/latest`;

const detectPlatform = () => {
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
  return 'windows'; // Default fallback
};

const detectArchitecture = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  // Check for Apple Silicon (M1/M2/M3)
  // On Apple Silicon Macs, navigator.platform returns "MacIntel" for compatibility
  // but we can detect ARM through various means
  if (platform.includes('mac') || userAgent.includes('mac')) {
    // Check if running in Rosetta or native ARM
    // Modern browsers expose this through userAgentData
    if (navigator.userAgentData?.platform === 'macOS') {
      // Chrome/Edge on macOS may expose architecture
      const arch = navigator.userAgentData?.architecture;
      if (arch === 'arm') return 'arm64';
    }

    // Fallback: Check for Apple Silicon hints in userAgent
    // Safari on Apple Silicon includes specific identifiers
    if (userAgent.includes('macintosh') &&
        (userAgent.includes('applewebkit') && !userAgent.includes('intel'))) {
      // Could be Apple Silicon, but not definitive
    }

    // Use WebGL renderer as fallback detection
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = ((gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string).toLowerCase();
          if (renderer.includes('apple m') || renderer.includes('apple gpu')) {
            return 'arm64';
          }
        }
      }
    } catch (e) {
      // WebGL not available
    }

    return 'x64'; // Default to Intel for Mac
  }

  // Windows ARM detection
  if (platform.includes('win')) {
    if (userAgent.includes('arm64') || userAgent.includes('aarch64')) {
      return 'arm64';
    }
    return 'x64';
  }

  // Linux ARM detection
  if (platform.includes('linux')) {
    if (userAgent.includes('aarch64') || userAgent.includes('arm64')) {
      return 'arm64';
    }
    return 'x64';
  }

  return 'x64'; // Default fallback
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

const getAssetLabel = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.includes('.msi')) return 'Windows Installer (.msi)';
  if (lower.includes('.exe') && lower.includes('setup')) return 'Windows Setup (.exe)';
  if (lower.includes('.exe')) return 'Windows (.exe)';
  if (lower.includes('.dmg') && lower.includes('aarch64')) return 'macOS Apple Silicon (.dmg)';
  if (lower.includes('.dmg') && lower.includes('x64')) return 'macOS Intel (.dmg)';
  if (lower.includes('.dmg')) return 'macOS (.dmg)';
  if (lower.includes('.appimage')) return 'AppImage';
  if (lower.includes('.deb')) return 'Debian/Ubuntu (.deb)';
  if (lower.includes('.rpm')) return 'Fedora/RHEL (.rpm)';
  return filename;
};

const getAssetArchitecture = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.includes('aarch64') || lower.includes('arm64')) return 'arm64';
  if (lower.includes('x64') || lower.includes('x86_64') || lower.includes('amd64')) return 'x64';
  return 'x64'; // Default
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
    macos: assets.filter((a: ReleaseAsset) => /\.dmg$/i.test(a.name) || a.name.toLowerCase().includes('darwin') || a.name.toLowerCase().includes('macos')),
    linux: assets.filter((a: ReleaseAsset) => /\.(appimage|deb|rpm)$/i.test(a.name))
  };
};

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  assets: ReleaseAsset[];
  body?: string;
}

interface PlatformSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  assets: ReleaseAsset[];
  isCurrentPlatform: boolean;
  userArchitecture: string;
}

const PlatformSection = ({ title, icon: Icon, assets, isCurrentPlatform, userArchitecture }: PlatformSectionProps): React.ReactElement | null => {
  if (!assets || assets.length === 0) return null;

  // Sort assets to put the user's architecture first
  const sortedAssets = [...assets].sort((a, b) => {
    const archA = getAssetArchitecture(a.name);
    const archB = getAssetArchitecture(b.name);
    if (archA === userArchitecture && archB !== userArchitecture) return -1;
    if (archB === userArchitecture && archA !== userArchitecture) return 1;
    return 0;
  });

  return (
    <div className={`apps-platform-section ${isCurrentPlatform ? 'apps-platform-current' : ''}`}>
      <h3>
        <Icon className="platform-icon" />
        {title}
        {isCurrentPlatform && <span className="apps-platform-badge">Dein System</span>}
      </h3>
      <ul className="apps-download-list">
        {sortedAssets.map((asset) => {
          const assetArch = getAssetArchitecture(asset.name);
          const isRecommended = isCurrentPlatform && assetArch === userArchitecture;

          return (
            <li key={asset.id}>
              <a
                href={asset.browser_download_url}
                className={`btn-primary apps-download-btn ${isRecommended ? 'apps-download-recommended' : ''}`}
                download
              >
                <HiDownload />
                <span className="download-label">
                  {getAssetLabel(asset.name)}
                  {isRecommended && <span className="apps-recommended-badge">Empfohlen</span>}
                </span>
                <span className="download-size">({formatSize(asset.size)})</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const AppsPage = () => {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    fetchRelease();
  }, [fetchRelease]);

  if (loading) {
    return (
      <div className="page-container">
        <h1>Grünerator Desktop App</h1>
        <p>Laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <h1>Grünerator Desktop App</h1>
        <p className="apps-error">{error}</p>
        <button onClick={fetchRelease} className="btn-primary">
          <HiRefresh /> Erneut versuchen
        </button>
      </div>
    );
  }

  if (!release) {
    return (
      <div className="page-container">
        <h1>Grünerator Desktop App</h1>
        <p>Keine Releases verfügbar.</p>
      </div>
    );
  }

  const categorizedAssets = categorizeAssets(release.assets);
  const hasAnyAssets = categorizedAssets.windows.length > 0 ||
                       categorizedAssets.macos.length > 0 ||
                       categorizedAssets.linux.length > 0;

  return (
    <div className="page-container">
      <h1>Grünerator Desktop App</h1>
      <p>
        Lade die Grünerator Desktop-App herunter für schnelleren Zugriff auf alle Funktionen
        - auch offline verfügbar.
      </p>

      <div className="apps-version-info">
        <span className="apps-version-badge">{release.tag_name}</span>
        <span className="apps-release-date">
          Veröffentlicht am {formatDate(release.published_at)}
        </span>
      </div>

      {hasAnyAssets ? (
        <div className="apps-platforms">
          <h2>Downloads</h2>
          {(() => {
            const currentPlatform = detectPlatform();
            const currentArchitecture = detectArchitecture();
            const platformConfigs = [
              { key: 'windows', title: 'Windows', icon: FaWindows, assets: categorizedAssets.windows },
              { key: 'macos', title: 'macOS', icon: FaApple, assets: categorizedAssets.macos },
              { key: 'linux', title: 'Linux', icon: FaLinux, assets: categorizedAssets.linux }
            ];

            // Sort to put current platform first
            const sortedPlatforms = [...platformConfigs].sort((a, b) => {
              if (a.key === currentPlatform) return -1;
              if (b.key === currentPlatform) return 1;
              return 0;
            });

            return (
              <div className="apps-platforms-grid">
                {sortedPlatforms.map((platform) => (
                  <PlatformSection
                    key={platform.key}
                    title={platform.title}
                    icon={platform.icon}
                    assets={platform.assets}
                    isCurrentPlatform={platform.key === currentPlatform}
                    userArchitecture={currentArchitecture}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        <p>Keine Download-Dateien in diesem Release verfügbar.</p>
      )}

      {release.body && (
        <div className="apps-release-notes">
          <h2>Änderungen in dieser Version</h2>
          <ReactMarkdown>{release.body}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default AppsPage;
