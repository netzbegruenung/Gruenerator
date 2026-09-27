import {
  PiBank,
  PiBird,
  PiBookOpenText,
  PiBuildings,
  PiChatsCircle,
  PiFileText,
  PiHandHeart,
  PiImage,
  PiImagesSquare,
  PiMagnifyingGlass,
  PiMegaphone,
  PiMicrophone,
  PiProjectorScreenChart,
  PiScales,
  PiSparkle,
  PiSquaresFour,
  PiTable,
} from 'react-icons/pi';

import type { AgentIconKey, SkillIcon } from '@gruenerator/shared/agents';

/**
 * Concept key → Phosphor component. `Record<AgentIconKey, …>` is the guard: the
 * key set is owned by `AGENT_ICON_KEYS` (packages/shared/src/agents/agentIcons.ts),
 * so a new concept fails to compile here until it is mapped. Sibling copies for
 * the other platforms: `apps/web/…/Sidebar/sidebarAgentConfig.ts` (same Phosphor
 * set) and `apps/mobile/components/chat/sidebarIcons.ts` (Ionicons).
 */
const AGENT_ICON_REGISTRY: Record<AgentIconKey, SkillIcon> = {
  sparkle: PiSparkle,
  megaphone: PiMegaphone,
  buildings: PiBuildings,
  'magnifying-glass': PiMagnifyingGlass,
  'chats-circle': PiChatsCircle,
  microphone: PiMicrophone,
  'book-open-text': PiBookOpenText,
  'hand-heart': PiHandHeart,
  'file-text': PiFileText,
  bird: PiBird,
  image: PiImage,
  'image-square': PiImagesSquare,
  'layout-grid': PiSquaresFour,
  table: PiTable,
  'projector-screen-chart': PiProjectorScreenChart,
  scales: PiScales,
  bank: PiBank,
};

/**
 * Lookup view on the same object. `iconKey` also carries the Phosphor component
 * names of user-created agents, so the miss is real and must stay typed —
 * `phosphorAgentIcon.tsx` handles those.
 */
const iconByKey: Readonly<Partial<Record<string, SkillIcon>>> = AGENT_ICON_REGISTRY;

export function resolveAgentIcon(identifier: string, iconKey?: string): SkillIcon | undefined {
  if (identifier.startsWith('gruenerator-oeffentlichkeitsarbeit')) return PiMegaphone;
  if (!iconKey) return undefined;
  return iconByKey[iconKey];
}
