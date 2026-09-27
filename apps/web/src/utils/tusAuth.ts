import { type UploadOptions } from 'tus-js-client';

import { getDesktopToken } from './desktopAuth';
import { isDesktopApp } from './platform';

/**
 * Credentials for a TUS upload. The upload endpoints are behind requireAuth,
 * so every TUS request has to carry a credential like any other API call: the
 * session cookie on web, and the stored bearer token in the desktop shell,
 * whose `tauri://localhost` origin has no cookie to send. Mirrors what
 * `platformFetch` does for plain fetches.
 */
export async function getTusAuthOptions(): Promise<
  Pick<UploadOptions, 'headers' | 'onBeforeRequest'>
> {
  if (isDesktopApp()) {
    const token = await getDesktopToken();
    return token != null ? { headers: { Authorization: `Bearer ${token}` } } : {};
  }
  return {
    // tus-js-client has no `withCredentials` option; the documented way to
    // send cookies is to reach the underlying XHR.
    onBeforeRequest: (req) => {
      const xhr = req.getUnderlyingObject() as XMLHttpRequest | undefined;
      if (xhr) xhr.withCredentials = true;
    },
  };
}
