import { useEffect, useState } from 'react';

import { secureStorage } from '../../services/storage';

/** The bearer token for `/api/share/…` image paths; null while it loads. */
export function useShareToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void secureStorage.getToken().then((t) => {
      if (alive) setToken(t);
    });
    return () => {
      alive = false;
    };
  }, []);
  return token;
}
