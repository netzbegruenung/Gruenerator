import { LoginProviders } from '@gruenerator/shared/auth';
import { useState } from 'react';

import './LoginOverlay.css';

interface LoginOverlayProps {
  documentTitle?: string;
  redirectTo: string;
}

export const LoginOverlay = ({ documentTitle, redirectTo }: LoginOverlayProps) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  return (
    <div className="login-overlay">
      <div className="login-overlay-backdrop" />
      <div className="login-overlay-card">
        <div className="login-overlay-branding">Grünerator Docs</div>

        {documentTitle && <p className="login-overlay-document">Zugriff auf: {documentTitle}</p>}

        <p className="login-overlay-message">Dieses Dokument erfordert eine Anmeldung</p>

        <LoginProviders
          redirectTo={redirectTo}
          disabled={isAuthenticating}
          onBeforeLogin={() => {
            setIsAuthenticating(true);
          }}
        />

        {isAuthenticating && (
          <p className="login-overlay-redirecting">Weiterleitung zum Login...</p>
        )}
      </div>
    </div>
  );
};
