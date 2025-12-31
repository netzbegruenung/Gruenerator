import React, { useState, useEffect, useCallback } from 'react';
import { FaWindows, FaApple, FaLinux } from 'react-icons/fa';
import { HiDownload, HiRefresh } from 'react-icons/hi';
import ReactMarkdown from 'react-markdown';
import '../../assets/styles/pages/Impressum_datenschutz.css';
import '../../assets/styles/components/ui/button.css';
import './AppsPage.css';

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

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatSize = (bytes) => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

const getAssetLabel = (filename) => {
  const lower = filename.toLowerCase();
  if (lower.includes('.msi')) return 'Windows Installer (.msi)';
  if (lower.includes('.exe') && lower.includes('setup')) return 'Windows Setup (.exe)';
  if (lower.includes('.exe')) return 'Windows (.exe)';
  if (lower.includes('.dmg')) return 'macOS Disk Image (.dmg)';
  if (lower.includes('.appimage')) return 'AppImage';
  if (lower.includes('.deb')) return 'Debian/Ubuntu (.deb)';
  if (lower.includes('.rpm')) return 'Fedora/RHEL (.rpm)';
  return filename;
};

const categorizeAssets = (assets) => {
  if (!assets) return { windows: [], macos: [], linux: [] };

  return {
    windows: assets.filter(a => /\.(exe|msi)$/i.test(a.name)),
    macos: assets.filter(a => /\.dmg$/i.test(a.name) || a.name.toLowerCase().includes('darwin') || a.name.toLowerCase().includes('macos')),
    linux: assets.filter(a => /\.(appimage|deb|rpm)$/i.test(a.name))
  };
};

const PlatformSection = ({ title, icon: Icon, assets, isCurrentPlatform }) => {
  if (!assets || assets.length === 0) return null;

  return (
    <div className={`apps-platform-section ${isCurrentPlatform ? 'apps-platform-current' : ''}`}>
      <h3>
        <Icon className="platform-icon" />
        {title}
        {isCurrentPlatform && <span className="apps-platform-badge">Dein System</span>}
      </h3>
      <ul className="apps-download-list">
        {assets.map((asset) => (
          <li key={asset.id}>
            <a
              href={asset.browser_download_url}
              className="btn-primary apps-download-btn"
              download
            >
              <HiDownload />
              <span className="download-label">{getAssetLabel(asset.name)}</span>
              <span className="download-size">({formatSize(asset.size)})</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

const AppsPage = () => {
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      setError(err.message);
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
