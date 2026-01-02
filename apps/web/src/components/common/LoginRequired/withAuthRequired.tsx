import React from 'react';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import LoginRequired from './LoginRequired';

interface AuthRequiredOptions {
  title?: string;
  message?: string;
}

/**
 * Higher-order component that wraps a component with authentication requirements
 * @param {React.Component} Component - The component to protect
 * @param {Object} options - Configuration options
 * @returns {React.Component} Protected component
 */
const withAuthRequired = <P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  options: AuthRequiredOptions = {}
) => {
  const {
    title, // Optional: will auto-generate from route if not provided
    message, // Optional: will use standard message if not provided
  } = options;

  return function AuthRequiredComponent(props: P) {
    const { user, isAuthenticated } = useOptimizedAuth();

    // Show login required if not authenticated
    if (!isAuthenticated || !user) {
      return (
        <>
          <div className="protected-content-blur">
            <Component {...props} user={null} />
          </div>
          <LoginRequired
            title={title}
            message={message}
            variant="fullpage"
          />
        </>
      );
    }

    // User is authenticated, render the component
    return <Component {...props} user={user} />;
  };
};

export default withAuthRequired;
