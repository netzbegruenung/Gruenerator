import {
  PiBird,
  PiBookOpenText,
  PiBuildings,
  PiChatsCircle,
  PiFileText,
  PiHandHeart,
  PiMagnifyingGlass,
  PiMegaphone,
  PiMicrophone,
  PiSparkle,
} from 'react-icons/pi';
import type { SkillIcon } from '@gruenerator/shared/agents';

const AGENT_ICON_REGISTRY: Record<string, SkillIcon> = {
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
};

export function resolveAgentIcon(identifier: string, iconKey?: string): SkillIcon | undefined {
  if (identifier.startsWith('gruenerator-oeffentlichkeitsarbeit')) return PiMegaphone;
  if (!iconKey) return undefined;
  return AGENT_ICON_REGISTRY[iconKey];
}
