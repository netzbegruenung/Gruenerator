import { type GroupLink } from '@gruenerator/shared/groups';
import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { openUrl } from '../../services/share';
import { BODY_FONT } from '../../theme';
import { ListGroup, ListRow } from '../common';

const LINK_ICONS: Record<string, IoniconsIconName> = {
  link: 'link',
  globe: 'globe-outline',
  mail: 'mail-outline',
  calendar: 'calendar-outline',
  chat: 'chatbubble-outline',
  folder: 'folder-outline',
  document: 'document-outline',
  video: 'videocam-outline',
  phone: 'call-outline',
  drive: 'cloud-outline',
};

/** Die Links des Projekts; ohne Links gibt es den Abschnitt nicht. */
export function ProjectLinks({ links }: { links: GroupLink[] }) {
  const theme = useTheme();
  if (links.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.textSecondary }]} accessibilityRole="header">
        Links
      </Text>
      <ListGroup>
        {links.map((link, i) => (
          <ListRow
            key={link.id}
            icon={LINK_ICONS[link.icon] ?? 'link'}
            title={link.title}
            value={link.description ?? link.url}
            onPress={() => void openUrl(link.url)}
            last={i === links.length - 1}
          />
        ))}
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  title: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
});
