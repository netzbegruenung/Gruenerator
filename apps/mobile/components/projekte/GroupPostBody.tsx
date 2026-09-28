import {
  errMessage,
  fileExtensionLabel,
  formatFileSize,
  type GroupPostContent,
} from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { groupPostFileUrl, shareGroupPostFile } from '../../hooks/useGroupContent';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, colors } from '../../theme';

import { GroupMentionText } from './GroupMentionText';

interface GroupPostBodyProps {
  groupId: string;
  postId: string;
  post: GroupPostContent;
  token: string | null;
}

/** Bildhöhe je Anzahl wie im Web: eins groß, zwei nebeneinander, ab drei ein Raster. */
const imageLayout = (count: number) =>
  count === 1
    ? { width: '100%' as const, height: 300 }
    : count === 2
      ? { width: '49.5%' as const, height: 200 }
      : { width: '32.8%' as const, height: 130 };

/** Text, Bilder und Dateien eines eigenen Beitrags — in der App nur zum Lesen. */
export function GroupPostBody({ groupId, postId, post, token }: GroupPostBodyProps) {
  const theme = useTheme();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const images = post.files.filter((f) => f.isImage);
  const others = post.files.filter((f) => !f.isImage);
  const layout = imageLayout(images.length);

  const open = (fileId: string) => {
    const file = post.files.find((f) => f.id === fileId);
    if (!file || loadingId) return;
    setLoadingId(file.id);
    shareGroupPostFile(groupId, postId, file)
      .catch((error: unknown) =>
        Alert.alert('Datei konnte nicht geladen werden', errMessage(error, file.name))
      )
      .finally(() => setLoadingId(null));
  };

  return (
    <View style={styles.root}>
      {post.body ? (
        <Text style={[styles.body, { color: theme.text }]}>
          <GroupMentionText text={post.body} />
          {post.editedAt ? (
            <Text style={[styles.edited, { color: theme.textSecondary }]}> (bearbeitet)</Text>
          ) : null}
        </Text>
      ) : null}

      {images.length > 0 && token ? (
        <View style={styles.grid}>
          {images.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => open(f.id)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${f.name} öffnen`}
              style={[layout, { backgroundColor: theme.surface }]}
            >
              <Image
                source={{
                  uri: groupPostFileUrl(groupId, postId, f.id),
                  headers: { Authorization: `Bearer ${token}` },
                }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      {others.map((f) => (
        <Pressable
          key={f.id}
          onPress={() => open(f.id)}
          accessibilityRole="button"
          accessibilityLabel={`${f.name}, ${formatFileSize(f.sizeBytes)} öffnen`}
          style={[styles.fileRow, { borderColor: theme.border }]}
        >
          <View style={[styles.badge, { backgroundColor: colors.primary[50] }]}>
            <Text style={styles.badgeText}>{fileExtensionLabel(f.name)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
              {f.name}
            </Text>
            <Text style={[styles.fileSize, { color: theme.textSecondary }]}>
              {formatFileSize(f.sizeBytes)}
            </Text>
          </View>
          {loadingId === f.id ? (
            <ActivityIndicator color={colors.primary[600]} />
          ) : (
            <Ionicons name="share-outline" size={20} color={theme.textSecondary} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 14, paddingTop: 10, gap: 10 },
  body: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 22 },
  edited: { fontSize: 13 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    borderRadius: 14,
    overflow: 'hidden',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  badge: {
    width: 36,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: BODY_FONT, fontSize: 10, fontWeight: '700', color: colors.primary[700] },
  flex: { flex: 1, minWidth: 0 },
  fileName: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  fileSize: { fontFamily: BODY_FONT, fontSize: 12 },
});
