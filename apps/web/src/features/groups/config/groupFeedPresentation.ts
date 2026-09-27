import { getAgentSlug } from '@gruenerator/shared/agents';
import { type GroupFeedItem, type GroupFeedKind } from '@gruenerator/shared/groups';
import {
  PiBookOpen,
  PiFile,
  PiFileText,
  PiImage,
  PiRobot,
  PiSparkle,
  PiSquaresFour,
  PiTextAa,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

export const FEED_KIND_ICONS: Record<GroupFeedKind, IconType> = {
  'sharepic-template': PiImage,
  sharepic: PiImage,
  doc: PiFileText,
  board: PiSquaresFour,
  generator: PiSparkle,
  agent: PiRobot,
  notebook: PiBookOpen,
  text: PiTextAa,
  template: PiFile,
  document: PiFile,
};

/** Wohin „Öffnen" führt; `null` = kein Ziel (Sharepic-Vorlagen werden geklont). */
export function feedItemHref(item: GroupFeedItem): string | null {
  switch (item.kind) {
    case 'sharepic':
      return `/studio/canvas/${item.id}`;
    case 'doc':
      return `/office/${item.id}`;
    case 'board':
      return `/boards/${item.id}`;
    case 'generator':
      return `/gruenerator/${item.slug ?? item.id}`;
    case 'notebook':
      return `/notebook/${item.id}`;
    case 'agent':
      return `/agentura/agent/${getAgentSlug(item.slug ?? item.id)}`;
    case 'document':
      return `/documents/${item.id}`;
    case 'sharepic-template':
    case 'text':
    case 'template':
      return null;
  }
}

export function formatFeedDate(iso: string | null, style: 'long' | 'short' = 'long'): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(
    'de-DE',
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'short' }
  );
}

export function personInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}
