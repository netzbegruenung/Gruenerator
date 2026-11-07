import { useQuery } from '@tanstack/react-query';

export type GeoPath = '/geo/de-bundeslaender.geo.json' | '/geo/europe-110m.json';

/**
 * Die Geodaten liegen im `public/` des Webs. Die App holt sie vom selben Host wie die
 * API (`EXPO_PUBLIC_API_URL` ohne `/api`, Rückfall `https://gruenerator.eu`), statt eine
 * zweite Kopie ins Bundle zu legen.
 */
export function geoUrl(path: GeoPath, apiUrl: string | null | undefined): string {
  const origin = (apiUrl ?? '').replace(/\/+$/, '').replace(/\/api$/, '');
  return `${origin || 'https://gruenerator.eu'}${path}`;
}

/** Eine Geodatei, einmal geladen und danach für die Sitzung gehalten. */
export function useGeoJson<T>(path: GeoPath) {
  return useQuery({
    queryKey: ['monitor', 'geo', path],
    queryFn: async (): Promise<T> => {
      const res = await fetch(geoUrl(path, process.env.EXPO_PUBLIC_API_URL));
      if (!res.ok) throw new Error(`Geodaten ${path}: HTTP ${res.status}`);
      return (await res.json()) as T;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
