import { confirmChatAction } from '@gruenerator/chat';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../theme';
import { documentIdFromUrl } from '../../utils/actionUrl';

import type { Theme } from '../../theme/colors';
import type { ChatMessageMetadata } from '@gruenerator/chat';

type ConfirmActionData = NonNullable<ChatMessageMetadata['confirmAction']>;
type CardStatus = 'idle' | 'loading' | 'confirmed' | 'rejected' | 'error' | 'expired';

// Native counterpart of web's ConfirmActionCard: chat proposes an action
// (save as doc, modify board, share); the user confirms or rejects, the
// shared confirmChatAction helper does the POST.
const ICON_MAP: Record<ConfirmActionData['type'], IoniconsIconName> = {
  save_as_doc: 'document-text-outline',
  modify_doc: 'pencil-outline',
  modify_board: 'grid-outline',
  share_doc: 'share-social-outline',
  create_group: 'people-outline',
  join_group: 'person-add-outline',
  add_cloud_connection: 'cloud-outline',
  attach_wolke_folder: 'folder-open-outline',
  set_notebook_visibility: 'eye-outline',
  share_notebook: 'share-social-outline',
  set_group_visibility: 'eye-outline',
  create_recurring_task: 'repeat-outline',
  create_user_agent: 'sparkles-outline',
  share_user_agent: 'share-social-outline',
};

const GROUP_ACTION_TYPES: ReadonlySet<ConfirmActionData['type']> = new Set([
  'create_group',
  'join_group',
  'share_notebook',
  'set_group_visibility',
  'share_user_agent',
]);

export function ConfirmActionCard({ action, theme }: { action: ConfirmActionData; theme: Theme }) {
  const router = useRouter();
  const [status, setStatus] = useState<CardStatus>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirm = useCallback(
    async (confirmed: boolean) => {
      setStatus('loading');
      const outcome = await confirmChatAction(action, confirmed);
      if (outcome.status === 'error') {
        setErrorMessage(outcome.message);
        setStatus('error');
        return;
      }
      if (outcome.status === 'confirmed') {
        setResultUrl(outcome.url);
      }
      setStatus(outcome.status);
    },
    [action]
  );

  const openResult = useCallback(() => {
    if (!resultUrl) return;
    const documentId = documentIdFromUrl(resultUrl);
    if (documentId) {
      // doc-editor reads `id` from useLocalSearchParams.
      router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: documentId } });
    }
  }, [resultUrl, router]);

  if (status === 'confirmed') {
    const canOpen = resultUrl !== null && documentIdFromUrl(resultUrl) !== null;
    return (
      <Pressable
        onPress={openResult}
        disabled={!canOpen}
        style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canOpen }}
      >
        <Ionicons name="checkmark" size={14} color={colors.primary[600]} />
        <Text style={[styles.badgeText, { color: theme.text }]}>{action.title}</Text>
        {canOpen && (
          <Text style={[styles.badgeLink, { color: colors.primary[600] }]}>
            {action.type === 'modify_board'
              ? 'Board öffnen'
              : GROUP_ACTION_TYPES.has(action.type)
                ? 'Gruppe öffnen'
                : 'Dokument öffnen'}
          </Text>
        )}
      </Pressable>
    );
  }

  if (status === 'rejected' || status === 'expired') {
    return (
      <View style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="close" size={14} color={theme.textSecondary} />
        <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
          {status === 'rejected' ? 'Abgebrochen' : 'Aktion abgelaufen'}
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.card, { borderColor: colors.error[500], backgroundColor: theme.card }]}>
        <Text style={[styles.errorText, { color: colors.error[500] }]}>{errorMessage}</Text>
        <Pressable
          onPress={() => {
            setStatus('idle');
            setErrorMessage(null);
          }}
          style={[styles.cancelButton, { borderColor: theme.border }]}
          accessibilityRole="button"
        >
          <Text style={[styles.cancelLabel, { color: theme.text }]}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
      <View style={styles.header}>
        <Ionicons name={ICON_MAP[action.type]} size={18} color={colors.primary[600]} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]}>{action.title}</Text>
          {action.description ? (
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {action.description}
            </Text>
          ) : null}
        </View>
      </View>

      {action.metadata.length > 0 && (
        <View style={styles.metaRow}>
          {action.metadata.map((m) => (
            <Text key={m.key} style={[styles.metaItem, { color: theme.textSecondary }]}>
              {m.key}: <Text style={{ color: theme.text }}>{m.value}</Text>
            </Text>
          ))}
        </View>
      )}

      <View style={styles.buttons}>
        <Pressable
          onPress={() => void handleConfirm(true)}
          disabled={status === 'loading'}
          style={[styles.confirmButton, { backgroundColor: colors.primary[600] }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: status === 'loading' }}
        >
          {status === 'loading' ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="checkmark" size={15} color={colors.white} />
          )}
          <Text style={styles.confirmLabel}>{action.confirmLabel}</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleConfirm(false)}
          disabled={status === 'loading'}
          style={[styles.cancelButton, { borderColor: theme.border }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: status === 'loading' }}
        >
          <Text style={[styles.cancelLabel, { color: theme.text }]}>{action.cancelLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.xsmall,
    padding: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: spacing.xsmall,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...chatType.chatTitle,
    fontWeight: '600',
  },
  description: {
    ...chatType.chatSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
    marginLeft: spacing.large,
  },
  metaItem: {
    ...chatType.chatMeta,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.xsmall,
    marginLeft: spacing.large,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
  },
  confirmLabel: {
    ...chatType.chatSecondary,
    color: colors.white,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  cancelButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  cancelLabel: {
    ...chatType.chatSecondary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    alignSelf: 'flex-start',
    marginVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  badgeText: {
    ...chatType.chatSecondary,
    fontWeight: '600',
  },
  badgeLink: {
    ...chatType.chatSecondary,
    fontWeight: '600',
  },
  errorText: {
    ...chatType.chatSecondary,
  },
});
