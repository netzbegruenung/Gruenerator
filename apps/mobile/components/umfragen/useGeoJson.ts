import { useQuery } from '@tanstack/react-query';

import { WEB_ORIGIN } from '../../services/webOrigin';

export type GeoPath = '/geo/de-bundeslaender.geo.json' | '/geo/europe-110m.json';

/**
 * Die Geodaten liegen im `public/` des Webs. Die App holt sie vom selben Host wie die
 * API (`EXPO_PUBLIC_API_URL` ohne `/api`, Rückfall `WEB_ORIGIN`), statt eine
 * zweite Kopie ins Bundle zu legen.
 */
export function geoUrl(path: GeoPath, apiUrl: string | null | undefined): string {
  const origin = (apiUrl ?? '').replace(/\/+$/, '').replace(/\/api$/, '');
  return `${origin || WEB_ORIGIN}${path}`;
}

/** Eine Geodatei, einmal geladen und danach für die Sitzung gehalten. */
export function useGeoJson<T>(path: GeoPath) {
  return useQuery({
    queryKey: ['monitor', 'geo', path],
    queryFn: async (): Promise<T> => {
      const res = await fetch(
        geoUrl(path, process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api')
      );
      if (!res.ok) throw new Error(`Geodaten ${path}: HTTP ${res.status}`);
      return (await res.json()) as T;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
