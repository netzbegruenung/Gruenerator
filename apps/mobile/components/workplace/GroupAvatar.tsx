import { Image } from 'expo-image';
import { View, Text, StyleSheet } from 'react-native';

import { getGroupInitials } from '../../hooks/useGroups';
import { colors, typography } from '../../theme';

interface Props {
  name: string | null | undefined;
  avatarUrl?: string | null;
  size?: number;
}

export function GroupAvatar({ name, avatarUrl, size = 64 }: Props) {
  const radius = size / 2;

  if (avatarUrl) {
    const src = avatarUrl.startsWith('http')
      ? avatarUrl
      : `${process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api'}${avatarUrl}`;
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        accessibilityLabel={name ? `Avatar von ${name}` : 'Gruppen-Avatar'}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius, backgroundColor: colors.primary[600] },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{getGroupInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...typography.bodyBold, color: colors.white, fontWeight: '700' },
});
