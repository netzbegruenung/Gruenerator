import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

// Ghost (outline) Ionicons in eucalyptus, mirroring the web sidebar's icon
// language. Agents resolve by `iconKey` — the same keys the web ICON_REGISTRY
// uses.

const AGENT_ICONS: Record<string, IoniconsIconName> = {
  sparkle: 'sparkles-outline',
  megaphone: 'megaphone-outline',
  buildings: 'business-outline',
  'magnifying-glass': 'search-outline',
  'chats-circle': 'chatbubbles-outline',
  microphone: 'mic-outline',
  'book-open-text': 'book-outline',
  'hand-heart': 'heart-outline',
  'file-text': 'document-text-outline',
  bird: 'leaf-outline',
};

// User-created agents store a react-icons Phosphor component name (e.g.
// `PiMegaphone`) in `iconKey` — see SUGGESTED_AGENT_ICONS in
// packages/shared/src/agents/agentIcons.ts. Map the curated suggestion set to
// the closest Ionicon (mirroring AGENT_ICONS' choices for overlapping
// concepts). The picker on web is unrestricted, so any name outside this set
// falls back to the default sparkle — acceptable, the colored tile + title
// still identify the agent.
const PHOSPHOR_AGENT_ICONS: Record<string, IoniconsIconName> = {
  PiSparkle: 'sparkles-outline',
  PiMegaphone: 'megaphone-outline',
  PiNewspaper: 'newspaper-outline',
  PiMagnifyingGlass: 'search-outline',
  PiChatsCircle: 'chatbubbles-outline',
  PiBuildings: 'business-outline',
  PiTree: 'leaf-outline',
  PiLeaf: 'leaf-outline',
  PiUsersThree: 'people-outline',
  PiCalendarBlank: 'calendar-outline',
  PiImage: 'image-outline',
  PiGlobeSimple: 'globe-outline',
  PiBookOpenText: 'book-outline',
  PiMicrophone: 'mic-outline',
  PiHandHeart: 'heart-outline',
  PiBird: 'leaf-outline',
  PiFileText: 'document-text-outline',
  PiLightbulb: 'bulb-outline',
  PiHeart: 'heart-outline',
  PiRocketLaunch: 'rocket-outline',
};

export const agentIcon = (iconKey: string | undefined): IoniconsIconName =>
  (iconKey && (AGENT_ICONS[iconKey] || PHOSPHOR_AGENT_ICONS[iconKey])) || 'sparkles-outline';
