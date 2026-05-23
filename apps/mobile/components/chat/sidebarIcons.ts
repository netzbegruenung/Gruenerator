import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

// Ghost (outline) Ionicons in eucalyptus, mirroring the web sidebar's icon
// language. Agents resolve by `iconKey` (the same keys the web ICON_REGISTRY
// uses); tools resolve by identifier; notebooks share one library glyph.

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

const TOOL_ICONS: Record<string, IoniconsIconName> = {
  web: 'globe-outline',
  research: 'flask-outline',
  search: 'document-outline',
  documentchat: 'chatbubble-outline',
  summary: 'list-outline',
  image: 'color-palette-outline',
  image_edit: 'leaf-outline',
  image_edit_universal: 'image-outline',
  sharepic: 'image-outline',
};

export const NOTEBOOK_ICON: IoniconsIconName = 'library-outline';

export const agentIcon = (iconKey: string | undefined): IoniconsIconName =>
  (iconKey && AGENT_ICONS[iconKey]) || 'sparkles-outline';

export const toolIcon = (identifier: string): IoniconsIconName =>
  TOOL_ICONS[identifier] || 'construct-outline';
