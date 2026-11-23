import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';

import { getVisitorDevice } from '../../utils/platform';

import { STORE_URLS } from './storeLinks';

/**
 * `/app` — the public target of the download QR codes. A phone goes straight to its
 * store; every other device lands on /apps (which asks for a login, a phone shouldn't).
 */
export default function AppDownloadRedirect() {
  const device = getVisitorDevice();
  const storeUrl = device ? STORE_URLS[device] : null;

  useEffect(() => {
    if (storeUrl) window.location.replace(storeUrl);
  }, [storeUrl]);

  if (storeUrl) return null;
  return <Navigate to="/apps" replace />;
}
