import React from 'react';
import { QUICK_LINKS } from '../../../config/quickLinksConfig';
import { isDesktopApp } from '../../../utils/platform';

const QuickLinks: React.FC = () => {
  const handleClick = async (url: string) => {
    console.log('[QuickLinks] Click handler called for:', url);
    console.log('[QuickLinks] isDesktopApp():', isDesktopApp());

    if (isDesktopApp()) {
      try {
        console.log('[QuickLinks] Attempting Tauri opener import...');
        const openerModule = await import('@tauri-apps/plugin-opener');
        console.log('[QuickLinks] Opener module loaded:', openerModule);
        const { open } = openerModule;
        console.log('[QuickLinks] Calling open() with:', url);
        await open(url);
        console.log('[QuickLinks] open() completed successfully');
        return;
      } catch (error) {
        console.error('[QuickLinks] Tauri opener failed:', error);
        // Fall through to window.open
      }
    }
    console.log('[QuickLinks] Using window.open fallback');
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
