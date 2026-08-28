import { type AgentIconKey } from '@gruenerator/shared/agents';
import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

// Ghost (outline) Ionicons in eucalyptus, mirroring the web sidebar's icon
// language. System agents resolve by `iconKey`, whose closed set is
// AGENT_ICON_KEYS (packages/shared/src/agents/agentIcons.ts) —
// `Record<AgentIconKey, …>` is what keeps this copy from drifting against the
// two Phosphor ones (packages/chat/src/lib/agentIcons.ts,
// apps/web/…/sidebarAgentConfig.ts). Ionicons is a different set, so each
// concept needs its own nearest match here — never the Phosphor name.
const AGENT_ICONS: Record<AgentIconKey, IoniconsIconName> = {
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
  image: 'image-outline',
  'image-square': 'images-outline',
  'layout-grid': 'albums-outline',
  // Ionicons has no table glyph; the spreadsheet grid is the closest read.
  table: 'grid-outline',
  'projector-screen-chart': 'easel-outline',
  scales: 'scale-outline',
  bank: 'library-outline',
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

// Lookup views — `iconKey` is a free string on the agent (system agents carry a
// concept key, user-created ones a Phosphor component name).
const conceptIcons: Readonly<Partial<Record<string, IoniconsIconName>>> = AGENT_ICONS;
const phosphorIcons: Readonly<Partial<Record<string, IoniconsIconName>>> = PHOSPHOR_AGENT_ICONS;

export const agentIcon = (iconKey: string | undefined): IoniconsIconName =>
  (iconKey && (conceptIcons[iconKey] || phosphorIcons[iconKey])) || 'sparkles-outline';
