import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { usePopupDismiss } from '../../hooks/usePopupDismiss';

declare global {
  interface Window {
    grantAnalyticsConsent?: () => void;
  }
}

const PopupNutzungsbedingungen = () => {
  const location = useLocation();
  const isNoHeaderFooterRoute = location.pathname.includes('-no-header-footer');

  const { isDismissed, dismiss, isHydrated } = usePopupDismiss('termsAccepted');

  const [visible, setVisible] = useState(() => {
    return !isDismissed && !isNoHeaderFooterRoute;
  });

  // Hide if server state arrives and says dismissed (cross-device sync)
  useEffect(() => {
    if (isHydrated && isDismissed && visible) {
      setVisible(false);
    }
  }, [isHydrated, isDismissed, visible]);

  const handleAcceptAll = () => {
    dismiss();
    if (typeof window.grantAnalyticsConsent === 'function') {
      window.grantAnalyticsConsent();
    }
    setVisible(false);
  };

  const handleAcceptNecessary = () => {
    dismiss();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 w-full bg-background px-5 py-2.5 shadow-[0_-2px_5px_rgba(236,214,214,0.3)] text-left z-[1003] flex items-center box-border max-md:flex-col max-md:p-[15px] max-md:pb-[25px] max-md:gap-2.5 max-md:text-center max-sm:p-2.5">
      <p className="grow max-md:text-[0.9em] max-md:mb-2.5 max-sm:text-[0.8em]">
        Diese Website verwendet Cookies. Durch die Nutzung stimmst du den{' '}
        <a href="/datenschutz#nutzungsbedingungen" className="text-foreground-heading underline">
          Nutzungsbedingungen
        </a>{' '}
        zu.{' '}
        <a href="/datenschutz#webanalyse" className="text-foreground-heading underline">
          Mehr erfahren
        </a>
      </p>
      <div className="flex gap-3 items-center max-md:flex-col max-md:w-full">
        <button
          className="bg-foreground-heading text-background px-5 py-2.5 border-none rounded-[50px] text-base cursor-pointer transition-[background-color,color] duration-300 no-underline hover:bg-secondary-600 hover:text-white max-md:w-full max-md:justify-center max-md:px-5 max-md:py-3 max-sm:text-[0.9em] max-sm:px-4 max-sm:py-2.5"
          onClick={handleAcceptNecessary}
        >
          Nur Notwendige
        </button>
        <button
          className="bg-foreground-heading text-background px-5 py-2.5 border-none rounded-[50px] text-base cursor-pointer transition-[background-color,color] duration-300 no-underline hover:bg-secondary-600 hover:text-white max-md:w-full max-md:justify-center max-md:px-5 max-md:py-3 max-sm:text-[0.9em] max-sm:px-4 max-sm:py-2.5"
          onClick={handleAcceptAll}
        >
          Alle akzeptieren
        </button>
      </div>
    </div>
  );
};

export default PopupNutzungsbedingungen;
