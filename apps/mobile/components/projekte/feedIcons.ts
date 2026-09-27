import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import type { GroupFeedKind } from '@gruenerator/shared/groups';

export const FEED_KIND_ICONS: Record<GroupFeedKind, IoniconsIconName> = {
  'sharepic-template': 'image-outline',
  sharepic: 'image-outline',
  doc: 'document-text-outline',
  board: 'grid-outline',
  generator: 'sparkles-outline',
  agent: 'chatbubbles-outline',
  notebook: 'book-outline',
  text: 'reader-outline',
  template: 'albums-outline',
  document: 'folder-outline',
};
