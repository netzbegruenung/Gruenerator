import { useLocation, useNavigate } from 'react-router-dom';

import LoginPage from '../../../features/auth/pages/LoginPage';
import { getCurrentPath, buildLoginUrl } from '../../../utils/authRedirect';

import type { JSX } from 'react';

interface LoginRequiredProps {
  title?: string;
  message?: string;
  className?: string;
  variant?: 'inline' | 'fullpage' | 'limit-reached';
  onClose?: () => void;
  limitInfo?: {
    count?: number;
    limit?: number;
    remaining?: number;
    timeUntilReset?: string;
    resourceType?: string;
  };
}

const LoginRequired = ({
  title,
  message,
  className = '',
  variant = 'fullpage',
  onClose,
  limitInfo,
}: LoginRequiredProps): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();

  // Default close handler
  const handleClose =
    onClose ||
    (() => {
      if (window.history.length > 1) {
        void navigate(-1);
      } else {
        void navigate('/');
      }
    });

  // Generate limit-specific message if limitInfo is provided
  const getLimitMessage = () => {
    if (!limitInfo) return message;

    const { count, limit, timeUntilReset, resourceType } = limitInfo;
    const resourceLabel =
      (resourceType
        ? (
            {
              text: 'Textgenerierungen',
              image: 'Bildgenerierungen',
              pdf_export: 'PDF-Exporte',
            } as Record<string, string>
          )[resourceType]
        : undefined) || 'Generierungen';

    return `Du hast dein Tageslimit von ${limit} kostenlosen ${resourceLabel} erreicht (${count}/${limit} genutzt). ${timeUntilReset ? `Das Limit wird in ${timeUntilReset} zurückgesetzt.` : 'Das Limit wird um Mitternacht zurückgesetzt.'}\n\nMelde dich an für unbegrenzte Nutzung!`;
  };

  const displayMessage = variant === 'limit-reached' ? getLimitMessage() : message;

  // For fullpage variant, use the beautiful LoginPage component
  if (variant === 'fullpage' || variant === 'limit-reached') {
    return (
      <LoginPage
        mode="required"
        pageName={title || (variant === 'limit-reached' ? 'Limit erreicht' : undefined)}
        customMessage={displayMessage}
        onClose={handleClose}
      />
    );
  }

  // Keep simple inline variant for special cases
  if (variant === 'inline') {
    const handleLoginClick = () => {
      const currentPath = getCurrentPath(location);
      const loginUrl = buildLoginUrl(currentPath);
      window.location.href = loginUrl;
    };

    return (
      <div
        className={`login-required-inline ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--spacing-small)',
          padding: 'var(--spacing-small) var(--spacing-medium)',
          background: 'var(--background-color-alt)',
          borderRadius: 'var(--spacing-xsmall)',
          border: 'var(--border-subtle)',
        }}
      >
        <div style={{ fontSize: '1.2rem', color: 'var(--secondary-600)' }}>🔒</div>
        <span>Anmeldung erforderlich</span>
        <button
          onClick={handleLoginClick}
          style={{
            color: 'var(--link-color)',
            background: 'none',
            border: 'none',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontWeight: '500',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            padding: '0',
          }}
        >
          Jetzt anmelden
        </button>
      </div>
    );
  }

  // Default: use LoginPage for all other cases
  return (
    <LoginPage mode="required" pageName={title} customMessage={message} onClose={handleClose} />
  );
};

export default LoginRequired;
