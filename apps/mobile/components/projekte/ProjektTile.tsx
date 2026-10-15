import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { type GroupSummary } from '../../hooks/useGroups';
import { HEADING_FONT_BOLD, BODY_FONT } from '../../theme';
import { getToolTheme } from '../../theme/toolTheme';
import { GroupAvatar } from '../workplace/GroupAvatar';

/**
 * One project as web's ProjektTile: a square in the Projekte hue, the avatar
 * and the kind (personal or shared) on top, name and meta at the foot.
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
  const tone = getToolTheme('projekte', useColorScheme() === 'dark');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${meta}`}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size, backgroundColor: tone.tile },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.top}>
        <View style={styles.avatar}>
          <GroupAvatar name={group.name} avatarUrl={group.avatar_url} size={40} />
        </View>
        <Ionicons
          name={group.group_type === 'personal' ? 'person' : 'people'}
          size={18}
          color={tone.desc}
        />
      </View>
      <View>
        <Text style={[styles.name, { color: tone.title }]} numberOfLines={2}>
          {group.name}
        </Text>
        <Text style={[styles.meta, { color: tone.desc }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 20, padding: 16, justifyContent: 'space-between' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  name: { fontFamily: HEADING_FONT_BOLD, fontSize: 16, lineHeight: 20 },
  meta: { fontFamily: BODY_FONT, fontSize: 13, marginTop: 2 },
});
