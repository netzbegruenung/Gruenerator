import { useEffect, useState } from 'react';

/**
 * Tracks whether the editor is rendered on a mobile-web viewport (< 900px) and
 * NOT inside the native mobile bridge. Drives the WebSubsectionBar + mobile
 * subsection bridge paths.
 */
export function useMobileWebViewport(isMobileBridge: boolean): boolean {
  const [isMobileWeb, setIsMobileWeb] = useState(
    typeof window !== 'undefined' && window.innerWidth < 900 && !isMobileBridge
  );

  useEffect(() => {
    if (isMobileBridge) return;
    const handleResize = () => setIsMobileWeb(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileBridge]);

  return isMobileWeb;
}
