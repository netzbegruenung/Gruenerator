import { Modal, View, Text, StyleSheet, ScrollView, useColorScheme, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SharepicTypeSelector } from './SharepicTypeSelector';
import { TextInput, Button, ImagePicker } from '../common';
import {
  type SharepicType,
  sharepicTypeRequiresAuthor,
  sharepicTypeSupportsImage,
} from '@gruenerator/shared/sharepic';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface SharepicConfigModalProps {
  visible: boolean;
  onClose: () => void;
  type: SharepicType;
  onTypeChange: (type: SharepicType) => void;
  author: string;
  onAuthorChange: (author: string) => void;
  imageData: string | null;
  onImageChange: (base64: string | null, fileName: string | null) => void;
}

export function SharepicConfigModal({
  visible,
  onClose,
  type,
  onTypeChange,
  author,
  onAuthorChange,
  imageData,
  onImageChange,
}: SharepicConfigModalProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const showAuthorInput = sharepicTypeRequiresAuthor(type);
  const showImagePicker = sharepicTypeSupportsImage(type);

  const handleImageSelected = (base64: string, fileName: string) => {
    onImageChange(`data:image/jpeg;base64,${base64}`, fileName);
  };

  const handleImageClear = () => {
    onImageChange(null, null);
  };

  const handleImageError = (error: string) => {
    console.warn('[SharepicConfigModal] Image error:', error);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Sharepic konfigurieren</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <SharepicTypeSelector selected={type} onSelect={onTypeChange} />

          {showAuthorInput && (
            <View style={styles.section}>
              <TextInput
                label="Zitatgeber*in"
                placeholder="Wer soll zitiert werden?"
                value={author}
                onChangeText={onAuthorChange}
              />
            </View>
          )}

          {showImagePicker && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.text }]}>Hintergrundbild</Text>
              <View
                style={[
                  styles.imagePickerContainer,
                  {
                    backgroundColor: isDark ? colors.grey[900] : colors.grey[50],
                    borderColor: theme.border,
                  },
                ]}
              >
                <ImagePicker
                  onImageSelected={handleImageSelected}
                  onError={handleImageError}
                  selectedImage={
                    imageData ? { uri: imageData, fileName: 'Ausgewähltes Bild' } : null
                  }
                  onClear={handleImageClear}
                />
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Button onPress={onClose} variant="primary">
            Fertig
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.medium,
    borderBottomWidth: 1,
  },
  title: {
    ...typography.h3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.medium,
    gap: spacing.large,
  },
  section: {
    gap: spacing.small,
  },
  sectionLabel: {
    ...typography.body,
    fontWeight: '500',
  },
  imagePickerContainer: {
    borderRadius: borderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  footer: {
    padding: spacing.medium,
    borderTopWidth: 1,
  },
});
