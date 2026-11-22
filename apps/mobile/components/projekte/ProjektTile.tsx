import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { type GroupSummary } from '../../hooks/useGroups';
import { useTheme } from '../../hooks/useTheme';
import { HEADING_FONT_BOLD, BODY_FONT } from '../../theme';
import { GroupAvatar } from '../workplace/GroupAvatar';

import { groupColorTone } from './groupColorTone';
import { useProjekteTone } from './projekteTone';

/**
 * One project as web's ProjektTile: a square card, the avatar and the kind
 * (personal or shared) on top, name and meta at the foot. Neutral rather than
 * web's Projekte blue, which clashes with the app's green.
 */
export function ProjektTile({
  group,
  meta,
  size,
  onPress,
}: {
  group: GroupSummary;
  meta: string;
  size: number;
  onPress(): void;
}) {
  const theme = useTheme();
  const tone = useProjekteTone();
  // A chosen colour replaces the neutral card with the audited palette tone (both modes).
  const colored = groupColorTone(group.color, useColorScheme() === 'dark');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${meta}`}
      style={({ pressed }) => [
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: colored?.bg ?? theme.card,
          borderColor: colored?.bg ?? theme.cardBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.top}>
        <GroupAvatar groupId={group.id} name={group.name} avatarUrl={group.avatar_url} size={40} />
        <Ionicons
          name={(group.member_count ?? 1) > 1 ? 'people' : 'person'}
          size={18}
          color={colored?.title ?? tone.accent}
        />
      </View>
      <View>
        <Text style={[styles.name, { color: colored?.title ?? theme.text }]} numberOfLines={2}>
          {group.name}
        </Text>
        <Text
          style={[styles.meta, { color: colored?.desc ?? theme.textSecondary }]}
          numberOfLines={1}
        >
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontFamily: HEADING_FONT_BOLD, fontSize: 16, lineHeight: 20 },
  meta: { fontFamily: BODY_FONT, fontSize: 13, marginTop: 2 },
});
