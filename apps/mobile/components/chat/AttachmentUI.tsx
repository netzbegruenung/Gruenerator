import { useAuiState, AttachmentRemove } from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { View, Text, StyleSheet } from 'react-native';

import { colors, borderRadius } from '../../theme';

/**
 * Renders a single attachment as a horizontal badge/chip in the composer.
 * Layout: [thumb/icon] [filename] [X]
 */
export function ComposerAttachmentUI() {
  const name = useAuiState((s) => s.attachment.name);
  const type = useAuiState((s) => s.attachment.type);
  const imageUri = useAuiState((s) => {
    const att = s.attachment;
    if (att.type === 'image' && att.content) {
      const imgPart = att.content.find((p) => p.type === 'image');
      if (imgPart && 'image' in imgPart) return imgPart.image as string;
    }
    return null;
  });

  return (
    <View style={styles.composerBadge}>
      {type === 'image' && imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.composerThumb} contentFit="cover" />
      ) : (
        <View style={styles.composerIconBox}>
          <Ionicons name={getFileIcon(name)} size={16} color={colors.primary[600]} />
        </View>
      )}
      <Text style={styles.composerName} numberOfLines={1}>
        {name}
      </Text>
      <AttachmentRemove style={styles.removeHitArea} hitSlop={8}>
        <View style={styles.removeCircle}>
          <Ionicons name="close" size={10} color={colors.white} />
        </View>
      </AttachmentRemove>
    </View>
  );
}

/**
 * Renders a single attachment badge in a sent user message (no remove button).
 */
export function MessageAttachmentUI() {
  const name = useAuiState((s) => s.attachment.name);
  const type = useAuiState((s) => s.attachment.type);
  const imageUri = useAuiState((s) => {
    const att = s.attachment;
    if (att.type === 'image' && att.content) {
      const imgPart = att.content.find((p) => p.type === 'image');
      if (imgPart && 'image' in imgPart) return imgPart.image as string;
    }
    return null;
  });

  return (
    <View style={styles.messageBadge}>
      {type === 'image' && imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.messageThumb} contentFit="cover" />
      ) : (
        <View style={styles.messageIconBox}>
          <Ionicons name={getFileIcon(name)} size={14} color={colors.white} />
        </View>
      )}
      <Text style={styles.messageName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function getFileIcon(filename: string): keyof typeof Ionicons.glyphMap {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'document-text-outline';
    case 'doc':
    case 'docx':
      return 'document-outline';
    case 'ppt':
    case 'pptx':
      return 'easel-outline';
    case 'txt':
      return 'reader-outline';
    default:
      return 'attach-outline';
  }
}

const styles = StyleSheet.create({
  /* ── Composer badge (horizontal chip with remove) ── */
  composerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.medium,
    paddingLeft: 4,
    paddingRight: 28, // room for remove button
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 4,
    maxWidth: 220,
    position: 'relative',
  },
  composerThumb: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.small,
    marginRight: 6,
  },
  composerIconBox: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.small,
    backgroundColor: colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  composerName: {
    fontSize: 13,
    color: colors.grey[700],
    flexShrink: 1,
  },
  removeHitArea: {
    position: 'absolute',
    top: -6,
    right: -6,
    zIndex: 1,
  },
  removeCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.grey[600],
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Message badge (sent, no remove) ── */
  messageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.small,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
    maxWidth: '100%',
  },
  messageThumb: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.small,
    marginRight: 6,
  },
  messageIconBox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.small,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  messageName: {
    fontSize: 13,
    color: colors.white,
    flex: 1,
  },
});
