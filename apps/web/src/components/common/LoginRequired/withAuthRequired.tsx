import React from 'react';

import { useAuthStore } from '../../../stores/authStore';

import LoginRequired from './LoginRequired';

interface AuthRequiredOptions {
  title?: string;
  message?: string;
  fallback?: React.ReactNode;
}

/**
 * Higher-order component that wraps a component with authentication requirements.
 * Uses direct Zustand selectors instead of useOptimizedAuth to avoid subscribing
 * to the full auth query (which causes re-renders on any auth state change).
 */
const withAuthRequired = <P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  options: AuthRequiredOptions = {}
) => {
  const { title, message, fallback } = options;

  return function AuthRequiredComponent(props: P) {
    const user = useAuthStore((s) => s.user);

    if (!user) {
      return (
        <>
          <div className="protected-content-blur">
            {fallback ?? <Component {...props} user={null} />}
          </div>
          <LoginRequired title={title} message={message} variant="fullpage" />
        </>
      );
    }

    return <Component {...props} user={user} />;
  };
};

export default withAuthRequired;
