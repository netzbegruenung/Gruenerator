import { View, Pressable, Text, StyleSheet, ScrollView, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { useGeneratorSelectionStore, useContentStore } from '../../stores';

export function AttachedContentList() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const selectedDocumentIds = useGeneratorSelectionStore((state) => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore((state) => state.selectedTextIds);
  const attachedFiles = useGeneratorSelectionStore((state) => state.attachedFiles);
  const toggleDocumentSelection = useGeneratorSelectionStore(
    (state) => state.toggleDocumentSelection
  );
  const toggleTextSelection = useGeneratorSelectionStore((state) => state.toggleTextSelection);
  const removeAttachedFile = useGeneratorSelectionStore((state) => state.removeAttachedFile);

  const { documents, texts } = useContentStore();

  const selectedDocuments = documents.filter((doc) => selectedDocumentIds.includes(doc.id));
  const selectedTexts = texts.filter((text) => selectedTextIds.includes(text.id));

  const hasContent =
    selectedDocuments.length > 0 || selectedTexts.length > 0 || attachedFiles.length > 0;

  if (!hasContent) {
    return null;
  }

  const truncateName = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    const extension = name.includes('.') ? name.split('.').pop() : '';
    const baseName = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
    const truncatedBase = baseName.slice(0, maxLength - 3 - (extension ? extension.length + 1 : 0));
    return extension ? `${truncatedBase}...${extension}` : `${truncatedBase}...`;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {attachedFiles.map((file) => (
        <View key={file.id} style={[styles.tag, { backgroundColor: theme.buttonBackground }]}>
          <Ionicons
            name={file.type.includes('pdf') ? 'document-outline' : 'image-outline'}
            size={14}
            color={theme.text}
          />
          <Text style={[styles.tagText, { color: theme.text }]} numberOfLines={1}>
            {truncateName(file.name)}
          </Text>
          <Pressable
            onPress={() => removeAttachedFile(file.id)}
            hitSlop={8}
            style={styles.removeButton}
          >
            <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}

      {selectedDocuments.map((doc) => (
        <View
          key={`doc-${doc.id}`}
          style={[styles.tag, { backgroundColor: theme.buttonBackground }]}
        >
          <Ionicons name="document-outline" size={14} color={theme.text} />
          <Text style={[styles.tagText, { color: theme.text }]} numberOfLines={1}>
            {truncateName(doc.title || 'Dokument')}
          </Text>
          <Pressable
            onPress={() => toggleDocumentSelection(doc.id)}
            hitSlop={8}
            style={styles.removeButton}
          >
            <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}

      {selectedTexts.map((text) => (
        <View
          key={`text-${text.id}`}
          style={[styles.tag, { backgroundColor: theme.buttonBackground }]}
        >
          <Ionicons name="text-outline" size={14} color={theme.text} />
          <Text style={[styles.tagText, { color: theme.text }]} numberOfLines={1}>
            {truncateName(text.title || 'Text')}
          </Text>
          <Pressable
            onPress={() => toggleTextSelection(text.id)}
            hitSlop={8}
            style={styles.removeButton}
          >
            <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xxsmall,
    paddingLeft: spacing.xsmall,
    paddingRight: spacing.xxsmall,
    borderRadius: borderRadius.pill,
    maxWidth: 180,
  },
  tagText: {
    ...typography.caption,
    flexShrink: 1,
  },
  removeButton: {
    padding: spacing.xxsmall,
  },
});
