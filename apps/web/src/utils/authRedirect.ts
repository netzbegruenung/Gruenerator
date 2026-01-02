/**
 * Unified authentication redirect utilities
 * Handles redirect URLs for authentication flows consistently across the app
 */

/**
 * Build login URL with proper redirectTo parameter
 * @param {string} redirectTo - URL to redirect to after login
 * @param {Object} options - Additional options
 * @param {string} options.source - Authentication source (gruenes-netz-login, etc.)
 * @param {string} options.prompt - Prompt type (register, login)
 * @returns {string} Complete login URL
 */
interface LoginUrlOptions {
  source?: string;
  prompt?: string;
}

export const buildLoginUrl = (redirectTo: string | null = null, options: LoginUrlOptions = {}) => {
  const params = new URLSearchParams();

  if (options.source) {
    params.append('source', options.source);
  }

  if (options.prompt) {
    params.append('prompt', options.prompt);
  }

  if (redirectTo) {
    params.append('redirectTo', redirectTo);
  }

  const queryString = params.toString();
  return `/login${queryString ? `?${queryString}` : ''}`;
};

/**
 * Get intended redirect URL from various sources
 * Priority: URL query params > location state > sessionStorage > default
 * @param {Location} location - React Router location object
 * @param {string} defaultRedirect - Default redirect if none found
 * @returns {string} Redirect URL
 */
export const getIntendedRedirect = (location, defaultRedirect = '/profile') => {
  // 1. Check URL query parameters (highest priority)
  const searchParams = new URLSearchParams(location.search);
  const redirectToParam = searchParams.get('redirectTo');
  if (redirectToParam) {
    console.log('[AuthRedirect] Using redirectTo from URL params:', redirectToParam);
    return redirectToParam;
  }

  // 2. Check React Router location state
  if (location.state?.from) {
    const fromPath = location.state.from.pathname + (location.state.from.search || '');
    console.log('[AuthRedirect] Using redirect from location state:', fromPath);
    return fromPath;
  }

  // 3. Check sessionStorage (legacy support)
  const sessionRedirect = sessionStorage.getItem('redirectAfterLogin');
  if (sessionRedirect) {
    console.log('[AuthRedirect] Using redirect from sessionStorage:', sessionRedirect);
    return sessionRedirect;
  }

  // 4. Return default
  console.log('[AuthRedirect] Using default redirect:', defaultRedirect);
  return defaultRedirect;
};

/**
 * Get current path for use as redirectTo parameter
 * @param {Location} location - React Router location object
 * @returns {string} Current path with search params
 */
export const getCurrentPath = (location) => {
  return location.pathname + (location.search || '');
};

/**
 * Check if a URL is a mobile deep-link
 * @param {string} url - URL to check
 * @returns {boolean} True if it's a mobile deep-link
 */
export const isMobileDeepLink = (url) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return !lower.startsWith('http://') && !lower.startsWith('https://') && url.includes('://');
};

/**
 * Detect if the current request is from a mobile app
 * @param {Location} location - React Router location object
 * @returns {boolean} True if request is from mobile app
 */
export const isMobileAppContext = (location) => {
  const searchParams = new URLSearchParams(location.search);
  const redirectTo = searchParams.get('redirectTo');

  // Check if redirectTo is a mobile deep-link
  if (isMobileDeepLink(redirectTo)) {
    return true;
  }

  // Check for mobile app user agent indicators
  const userAgent = navigator.userAgent || '';
  if (userAgent.includes('GrueneratorApp') || userAgent.includes('Mobile App')) {
    return true;
  }

  return false;
};

/**
 * Clear redirect state from sessionStorage
 */
export const clearRedirectState = () => {
  sessionStorage.removeItem('redirectAfterLogin');
};

/**
 * Store redirect path in sessionStorage (legacy compatibility)
 * @param {string} path - Path to store
 */
export const storeRedirectPath = (path) => {
  sessionStorage.setItem('redirectAfterLogin', path);
};