import { Image } from 'expo-image';
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useBearerToken } from '../../hooks/useGroupContent';
import { getGroupInitials } from '../../hooks/useGroups';
import { resolveChatUrl } from '../../services/chatApiUrl';
import { typography } from '../../theme';
import { useProjekteTone } from '../projekte/projekteTone';

interface Props {
  groupId: string;
  name: string | null | undefined;
  /** The stored file name — a version tag, not a URL. */
  avatarUrl?: string | null;
  size?: number;
}

/**
 * A project's picture, or its initials. The picture is served by
 * `/api/auth/groups/:id/avatar` to members only, so it needs the bearer; the
 * stored `avatar_url` is the file name and only busts the cache, as on web.
 */
export function GroupAvatar({ groupId, name, avatarUrl, size = 64 }: Props) {
  const token = useBearerToken();
  const tone = useProjekteTone();
  const [failed, setFailed] = useState(false);
  const radius = size / 2;

  if (avatarUrl && token && !failed) {
    return (
      <Image
        source={{
          uri: resolveChatUrl(
            `/api/auth/groups/${groupId}/avatar?v=${encodeURIComponent(avatarUrl)}`
          ),
          headers: { Authorization: `Bearer ${token}` },
        }}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        accessibilityLabel={name ? `Bild von ${name}` : 'Projektbild'}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: tone.soft,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.36, color: tone.accent }]}>
        {getGroupInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { ...typography.bodyBold, fontWeight: '700' },
});
