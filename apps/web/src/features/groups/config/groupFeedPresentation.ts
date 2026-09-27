import { getAgentSlug } from '@gruenerator/shared/agents';
import { type GroupFeedItem, type GroupFeedKind } from '@gruenerator/shared/groups';
import {
  PiBookOpen,
  PiChatText,
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
  post: PiChatText,
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

/**
 * Wohin „Öffnen" führt; `null` = kein Ziel (Sharepic-Vorlagen werden geklont,
 * Beiträge stehen ganz im Feed).
 */
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
    case 'post':
    case 'sharepic-template':
    case 'text':
    case 'template':
      return null;
  }
}
