import React from 'react';
import { QUICK_LINKS } from '../../../config/quickLinksConfig';
import { isDesktopApp } from '../../../utils/platform';

const QuickLinks: React.FC = () => {
  const handleClick = async (url: string) => {
    if (isDesktopApp()) {
      try {
        const { open } = await import('@tauri-apps/plugin-opener');
        await open(url);
        return;
      } catch (error) {
        console.error('[QuickLinks] Tauri opener failed:', error);
      }
    }
    window.open(url, '_blank');
  };

  if (QUICK_LINKS.length === 0) {
    return null;
  }

  return (
    <div className="titlebar-quick-links">
      {QUICK_LINKS.map((link) => {
        const Icon = link.icon;
        return (
          <button
            key={link.id}
            className="quick-link-btn"
            onClick={() => handleClick(link.url)}
            title={link.tooltip}
            aria-label={link.tooltip}
            type="button"
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
};

export default QuickLinks;
