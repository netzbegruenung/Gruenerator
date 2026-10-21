import { foldMarkerIntoAccent } from '@gruenerator/contracts';

/** A text without its inline marks (`**bold**`, `==accent==`, `++marker++` …) and hand-mark sentinels. */
export const stripMarks = (text: string) => text.replace(/\*\*|__|==|\+\+|[\u2061-\u2064]/g, '');

/** Every string of a slide with `++marker++` read as `==accent==` (AT has no marker boxes). */
export function foldMarkers<T>(value: T): T {
  if (typeof value === 'string') return foldMarkerIntoAccent(value) as T;
  if (Array.isArray(value)) return value.map(foldMarkers) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, foldMarkers(v)])) as T;
  }
  return value;
}
