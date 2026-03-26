import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  ScrollView,
} from 'react-native';

import { BottomSheet } from '../common/BottomSheet';
import {
  pickDocument,
  validatePickedDocument,
  uploadDocumentOnly,
  type PickedDocument,
  type UploadedDocument,
} from '../../services/documentPicker';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  createCollection: (params: {
    name: string;
    description?: string;
    documentId: string;
  }) => Promise<{ id: string } | null>;
}

type Step = 'upload' | 'metadata';

export function NotebookCreator({ visible, onClose, createCollection }: Props) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [step, setStep] = useState<Step>('upload');
  const [pickedDoc, setPickedDoc] = useState<PickedDocument | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<UploadedDocument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setPickedDoc(null);
    setUploadedDoc(null);
    setUploading(false);
    setName('');
    setDescription('');
    setCreating(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handlePickFile = useCallback(async () => {
    const doc = await pickDocument();
    if (!doc) return;
    if (!validatePickedDocument(doc)) return;

    setPickedDoc(doc);
    setUploading(true);

    const uploaded = await uploadDocumentOnly(doc);
    setUploading(false);

    if (uploaded) {
      setUploadedDoc(uploaded);
      const nameWithoutExt = doc.name.replace(/\.[^/.]+$/, '');
      setName(nameWithoutExt);
    } else {
      setPickedDoc(null);
    }
  }, []);

  const handleRemoveFile = useCallback(() => {
    setPickedDoc(null);
    setUploadedDoc(null);
    setName('');
  }, []);

  const handleNext = useCallback(() => {
    if (uploadedDoc) setStep('metadata');
  }, [uploadedDoc]);

  const handleCreate = useCallback(async () => {
    if (!uploadedDoc || !name.trim()) return;

    setCreating(true);
    const result = await createCollection({
      name: name.trim(),
      description: description.trim() || undefined,
      documentId: uploadedDoc.id,
    });
    setCreating(false);

    if (result) {
      reset();
      onClose();
    }
  }, [uploadedDoc, name, description, createCollection, reset, onClose]);

  const canCreate = name.trim().length > 0 && !creating;

  return (
    <BottomSheet visible={visible} onClose={handleClose} keyboardAvoiding maxHeight="80%">
      <View style={styles.header}>
        {step === 'metadata' ? (
          <Pressable onPress={() => setStep('upload')} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
        <Text style={[styles.title, { color: theme.text }]}>
          {step === 'upload' ? 'Dokument hochladen' : 'Notebook erstellen'}
        </Text>
        <Pressable onPress={handleClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'upload' ? (
          <View style={styles.stepContent}>
            {!pickedDoc ? (
              <Pressable
                onPress={handlePickFile}
                style={[styles.pickArea, { borderColor: theme.cardBorder }]}
              >
                <Ionicons name="cloud-upload-outline" size={40} color={colors.primary[600]} />
                <Text style={[styles.pickText, { color: theme.text }]}>Datei auswählen</Text>
                <Text style={[styles.pickHint, { color: theme.textSecondary }]}>
                  PDF, DOCX, TXT, ODT
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.filePreview, { borderColor: theme.cardBorder }]}>
                <Ionicons name="document-text" size={24} color={colors.primary[600]} />
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
                    {pickedDoc.name}
                  </Text>
                  {uploading ? (
                    <View style={styles.uploadingRow}>
                      <ActivityIndicator size="small" color={colors.primary[600]} />
                      <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                        Wird hochgeladen...
                      </Text>
                    </View>
                  ) : uploadedDoc ? (
                    <Text style={[styles.statusText, { color: colors.primary[600] }]}>
                      Hochgeladen
                    </Text>
                  ) : null}
                </View>
                {!uploading && (
                  <Pressable onPress={handleRemoveFile} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
                  </Pressable>
                )}
              </View>
            )}

            <Pressable
              onPress={handleNext}
              disabled={!uploadedDoc}
              style={[
                styles.button,
                {
                  backgroundColor: uploadedDoc ? colors.primary[600] : theme.surface,
                  opacity: uploadedDoc ? 1 : 0.5,
                },
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: uploadedDoc ? colors.white : theme.textSecondary },
                ]}
              >
                Weiter
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.stepContent}>
            <Text style={[styles.label, { color: theme.text }]}>Name *</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="Name des Notebooks"
              placeholderTextColor={theme.textSecondary}
              autoFocus
            />

            <Text style={[styles.label, { color: theme.text, marginTop: spacing.medium }]}>
              Beschreibung
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
                { color: theme.text, borderColor: theme.cardBorder, backgroundColor: theme.surface },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optionale Beschreibung"
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
            />

            <Pressable
              onPress={handleCreate}
              disabled={!canCreate}
              style={[
                styles.button,
                {
                  backgroundColor: canCreate ? colors.primary[600] : theme.surface,
                  opacity: canCreate ? 1 : 0.5,
                  marginTop: spacing.medium,
                },
              ]}
            >
              {creating ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    { color: canCreate ? colors.white : theme.textSecondary },
                  ]}
                >
                  Erstellen
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    gap: spacing.small,
  },
  title: {
    ...typography.bodyBold,
    fontSize: 17,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: spacing.medium,
  },
  stepContent: {
    gap: spacing.medium,
    paddingTop: spacing.small,
    paddingBottom: spacing.medium,
  },
  pickArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xlarge,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: borderRadius.large,
    gap: spacing.xsmall,
  },
  pickText: {
    ...typography.bodyBold,
    fontSize: 15,
  },
  pickHint: {
    fontSize: 12,
  },
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.medium,
    borderWidth: 1,
    borderRadius: borderRadius.large,
    gap: spacing.small,
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    paddingVertical: 12,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xxsmall,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
