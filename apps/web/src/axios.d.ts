import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** When true, the 401 response interceptor skips redirecting to login */
    skipAuthRedirect?: boolean;
  }
}
