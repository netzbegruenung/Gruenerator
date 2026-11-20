// Field data for the boot path (#5891): Core Web Vitals of real visits, sent as
// Umami events. Loaded only with analytics consent (see index.tsx), so it never
// costs the entry closure anything and nothing is sent without consent.
//
// Privacy: no user id, no full URL. The route is the first path segment only,
// because deeper segments carry slugs of private resources.
import {
  onCLS,
  onFCP,
  onINP,
  onLCP,
  onTTFB,
  type MetricWithAttribution,
} from 'web-vitals/attribution';

const EVENT = 'web-vitals';
const SELECTOR_MAX = 100;
const RETRY_MS = 1000;
const MAX_RETRIES = 15;

type EventData = Record<string, string | number>;

interface NetworkInformationLike {
  effectiveType?: string;
}

function routeOf(pathname: string): string {
  const first = pathname.split('/')[1] ?? '';
  return `/${first}`;
}

function targetOf(metric: MetricWithAttribution): string | null {
  const a = metric.attribution as Record<string, unknown>;
  const target = a.target ?? a.interactionTarget ?? a.largestShiftTarget;
  return typeof target === 'string' && target ? target.slice(0, SELECTOR_MAX) : null;
}

export function toEventData(metric: MetricWithAttribution, route: string): EventData {
  const data: EventData = {
    metric: metric.name,
    // CLS is unitless and small; everything else is milliseconds.
    value:
      metric.name === 'CLS' ? Math.round(metric.value * 1000) / 1000 : Math.round(metric.value),
    rating: metric.rating,
    route,
    navigation: metric.navigationType,
  };
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (connection?.effectiveType) data.connection = connection.effectiveType;
  const target = targetOf(metric);
  if (target) data.target = target;
  return data;
}

// Umami is injected with `defer` by index.html, so early metrics (TTFB, FCP)
// can be ready before the tracker. Retry briefly; if it never appears (blocked
// by an extension), the metric is dropped.
function send(data: EventData, attempt = 0): void {
  if (window.umami) {
    window.umami.track(EVENT, data);
    return;
  }
  if (attempt < MAX_RETRIES) setTimeout(() => send(data, attempt + 1), RETRY_MS);
}

export function reportWebVitals(): void {
  // web-vitals reports the initial hard navigation only; pin its route now,
  // because CLS and INP are reported at pagehide after SPA navigations.
  const route = routeOf(window.location.pathname);
  const report = (metric: MetricWithAttribution) => send(toEventData(metric, route));
  onTTFB(report);
  onFCP(report);
  onLCP(report);
  onCLS(report);
  onINP(report);
}
