import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** When true, the 401 response interceptor skips redirecting to login */
    skipAuthRedirect?: boolean;
    /** Internal: marks a request already re-fired once after a transient 401 */
    _retried401?: boolean;
  }
}
