import { type ToolIconKey } from '@gruenerator/chat';
import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

// Mobile presentation half of the shared tool metadata: map the platform-neutral
// `iconKey` (from getToolMeta) to an Ionicons name. Web maps the same keys to
// lucide components.
const TOOL_IONICON: Record<ToolIconKey, IoniconsIconName> = {
  search: 'search-outline',
  globe: 'globe-outline',
  book: 'book-outline',
  sparkles: 'sparkles-outline',
  user: 'person-outline',
  image: 'image-outline',
  'external-link': 'open-outline',
  'message-circle': 'chatbubble-outline',
  cloud: 'cloud-outline',
  file: 'document-text-outline',
  presentation: 'easel-outline',
  table: 'grid-outline',
  board: 'albums-outline',
  chart: 'bar-chart-outline',
};

export function toolIonicon(iconKey: ToolIconKey): IoniconsIconName {
  return TOOL_IONICON[iconKey];
}
