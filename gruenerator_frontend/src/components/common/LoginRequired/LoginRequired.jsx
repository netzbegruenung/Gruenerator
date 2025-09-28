import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import LoginPage from '../../../features/auth/pages/LoginPage';
import { getCurrentPath, buildLoginUrl } from '../../../utils/authRedirect';

const LoginRequired = ({ 
  title,
  message,
  className = '',
  variant = 'fullpage',
  onClose = null
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Default close handler
  const handleClose = onClose || (() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  });
  
  // For fullpage variant, use the beautiful LoginPage component
  if (variant === 'fullpage') {
    return (
      <LoginPage 
        mode="required" 
        pageName={title}
        customMessage={message}
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
      <div className={`login-required-inline ${className}`} style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-small)',
        padding: 'var(--spacing-small) var(--spacing-medium)',
        background: 'var(--background-color-alt)',
        borderRadius: 'var(--spacing-xsmall)',
        border: 'var(--border-subtle)'
      }}>
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
            padding: '0'
          }}
        >
          Jetzt anmelden
        </button>
      </div>
    );
  }

  // Default: use LoginPage for all other cases
  return (
    <LoginPage 
      mode="required" 
      pageName={title}
      customMessage={message}
      onClose={handleClose}
    />
  );
};

LoginRequired.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  className: PropTypes.string,
  variant: PropTypes.oneOf(['inline', 'fullpage']),
  onClose: PropTypes.func,
};

export default LoginRequired;