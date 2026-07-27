import {
  useAgentStore,
  MODEL_OPTIONS,
  AUTO_MODEL_ID,
  AUTO_MODEL_OPTION,
  COMPOSER_MODES,
  SEARCH_DEPTHS,
  showsSearchDepth,
  quickSkillMentionables,
  functionMentionables,
  connectorMentionables,
  connectorId,
  notebookMentionables,
  useSkillFavoritesStore,
  type ComposerIconKey,
  type Mentionable,
  type SearchDepthIconKey,
} from '@gruenerator/chat';
import { isModelEnabledByDefault } from '@gruenerator/shared/models';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { memo, useCallback, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { useShallow } from 'zustand/shallow';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius, BODY_FONT, chatType } from '../../theme';
import { route } from '../../types/routes';
import { BottomSheet } from '../common/BottomSheet';

// Presentation only: labels and keys come from the shared COMPOSER_MODES /
// SEARCH_DEPTHS lists; these map the semantic icon keys → Ionicons.
const MODE_ICONS: Record<ComposerIconKey, IoniconsIconName> = {
  chat: 'chatbubble-outline',
  notebook: 'book-outline',
  custom: 'settings-outline',
};

const DEPTH_ICONS: Record<SearchDepthIconKey, IoniconsIconName> = {
  fast: 'flash-outline',
  deep: 'telescope-outline',
};

/** Which detail list the sheet is showing; `null` is the root. */
type Detail = 'mode' | 'notebook' | 'skills' | 'functions' | 'depth' | 'model' | 'connectors';

const DETAIL_TITLES: Record<Detail, string> = {
  mode: 'Modus',
  notebook: 'Notebook',
  skills: 'Rezepte',
  functions: 'Funktionen',
  depth: 'Recherchetiefe',
  model: 'Modell',
  connectors: 'Konnektoren',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Attach actions. Omitted on composers without a runtime to attach to (the
   * start screen only hands its text to a new thread), which drops the tile row. */
  onPickFile?: () => void;
  onPickImage?: () => void;
  onTakePhoto?: () => void;
  onOpenDocBrowser?: () => void;
  /** Writes a picked recipe/function into the draft as an `@mention`. */
  onInsertMention?: (mentionable: Mentionable) => void;
}

/**
 * The composer's "+" sheet: what you can add to the chat, and every setting that
 * changes how the turn is answered — the mobile counterpart of web's `PlusMenu`,
 * and like it the composer's ONLY menu. The former separate gear sheet
 * (`ChatSettingsSheet`) split mode/notebook/model off into a second surface that
 * web never had, and left the model list filtered differently in each.
 *
 * Content follows web section for section. The per-tool switches this sheet used
 * to show ("Dokumentensuche", "Beispiele", …) are gone: `GrueneratorComposer`
 * has no such toggles — web configures `enabledTools` per agent, not per message
 * — so they were mobile-only drift. Recherchetiefe follows the shared
 * `showsSearchDepth` rule instead of being always visible, and the model list
 * web's own `isModelEnabledByDefault` filter, which mobile skipped and so
 * offered models web hides. Konnektoren is the opposite gap: web pins an MCP
 * server from this menu, mobile had no way to at all.
 *
 * Layout is the platform convention for a sheet like this: a row of large tiles
 * for the attach actions, then grouped cards whose rows carry their current
 * value and open a detail list in place.
 */
export const ComposerActionSheet = memo(function ComposerActionSheet({
  visible,
  onClose,
  onPickFile,
  onPickImage,
  onTakePhoto,
  onOpenDocBrowser,
  onInsertMention,
}: Props) {
  const theme = useTheme();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [detail, setDetail] = useState<Detail | null>(null);

  const {
    selectedAgentId,
    selectedModel,
    searchMode,
    threadMode,
    selectedNotebookId,
    pinnedConnector,
    customSystemPrompt,
  } = useAgentStore(
    useShallow((s) => ({
      selectedAgentId: s.selectedAgentId,
      selectedModel: s.selectedModel,
      searchMode: s.searchMode,
      threadMode: s.threadMode,
      selectedNotebookId: s.selectedNotebookId,
      pinnedConnector: s.pinnedConnector,
      customSystemPrompt: s.customSystemPrompt,
    }))
  );
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const setSearchMode = useAgentStore((s) => s.setSearchMode);
  const setThreadMode = useAgentStore((s) => s.setThreadMode);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);
  const setPinnedConnector = useAgentStore((s) => s.setPinnedConnector);

  // Module-level list, filled by `useMentionablesSync` on the composer that owns
  // this sheet. Read during the render that opens the sheet, exactly as web's
  // PlusMenu does, so it is current by the time anyone can see it.
  const connectors = connectorMentionables();
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const skills = quickSkillMentionables(favorites);
  const functions = functionMentionables();

  const models = MODEL_OPTIONS.filter((model) => isModelEnabledByDefault(model.id));
  const activeModel =
    !selectedModel || selectedModel === AUTO_MODEL_ID
      ? AUTO_MODEL_OPTION.name
      : (models.find((m) => m.id === selectedModel)?.name ?? AUTO_MODEL_OPTION.name);
  const activeDepth = SEARCH_DEPTHS.find((d) => d.mode === searchMode) ?? SEARCH_DEPTHS[0];
  // Web disables "Eigener Chat" without a custom prompt to fall back on; mobile
  // never populates one (`useUserProfileStore` is hydrated web-only), so the
  // entry would produce a body with `agentId: null` and no prompt — which the
  // server answers with the universal agent, silently. Hidden until mobile
  // actually carries roles.
  const modes = COMPOSER_MODES.filter((m) => m.mode !== 'eigener' || customSystemPrompt);
  const activeMode = modes.find((m) => m.mode === threadMode) ?? modes[0];
  const activeNotebook = notebookMentionables.find((nb) => nb.identifier === selectedNotebookId);

  // Every way out returns the sheet to its root, so reopening never lands in the
  // detail list the user left behind.
  const close = useCallback(() => {
    setDetail(null);
    onClose();
  }, [onClose]);

  const runAction = useCallback(
    (action: () => void) => {
      close();
      action();
    },
    [close]
  );

  const cardStyle = { backgroundColor: isDark ? theme.surface : colors.white };
  const badgeStyle = { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] };

  const tile = (icon: IoniconsIconName, label: string, onPress: () => void) => (
    <Pressable
      onPress={() => runAction(onPress)}
      style={({ pressed }) => [styles.tile, cardStyle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.tileBadge, badgeStyle]}>
        <Ionicons name={icon} size={22} color={theme.text} />
      </View>
      <Text style={[styles.tileLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );

  const row = ({
    key,
    icon,
    title,
    value,
    onPress,
    selected,
    last,
  }: {
    key: string;
    icon: IoniconsIconName;
    title: string;
    value?: string | null;
    onPress: () => void;
    /** Detail rows show a check instead of the chevron. */
    selected?: boolean;
    last?: boolean;
  }) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.rowBadge, badgeStyle]}>
        <Ionicons name={icon} size={22} color={theme.text} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {value ? (
          <Text style={[styles.rowValue, { color: theme.textSecondary }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {selected === undefined ? (
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      ) : selected ? (
        <Ionicons name="checkmark" size={22} color={colors.primary[600]} />
      ) : (
        <View style={styles.trailingSpacer} />
      )}
    </Pressable>
  );

  const detailRows = (): ReactNode => {
    if (detail === 'mode') {
      return modes.map((mode, i) =>
        row({
          key: mode.mode,
          icon: MODE_ICONS[mode.icon],
          title: mode.label,
          onPress: () => {
            setThreadMode(mode.mode);
            setDetail(mode.mode === 'notebook' ? 'notebook' : null);
          },
          selected: threadMode === mode.mode,
          last: i === modes.length - 1,
        })
      );
    }
    if (detail === 'notebook') {
      return notebookMentionables.map((notebook, i) =>
        row({
          key: notebook.identifier,
          icon: 'book-outline',
          title: notebook.title,
          onPress: () => {
            setSelectedNotebook(notebook.identifier);
            setThreadMode('notebook');
            setDetail(null);
          },
          selected: selectedNotebookId === notebook.identifier,
          last: i === notebookMentionables.length - 1,
        })
      );
    }
    if (detail === 'skills' || detail === 'functions') {
      const list = detail === 'skills' ? skills : functions;
      const rows = list.map((item, i) =>
        row({
          // `mention`, not `identifier`: eighteen recipes share eight owning-agent
          // identifiers, so keying on those collides.
          key: item.mention,
          icon: detail === 'skills' ? 'color-wand-outline' : 'flash-outline',
          title: item.title,
          value: item.description,
          onPress: () => runAction(() => onInsertMention?.(item)),
          last: detail === 'skills' ? false : i === list.length - 1,
        })
      );
      if (detail === 'functions') return rows;
      // Web closes its recipe submenu with two entries — a search across all
      // recipes and a link to the library. On mobile the Agentura screen is both,
      // so it is one row.
      return [
        ...rows,
        row({
          key: 'all-recipes',
          icon: 'library-outline',
          title: 'Alle Rezepte',
          value: 'In der Agentura durchsuchen',
          onPress: () => runAction(() => router.push(route('/(focused)/agents'))),
          last: true,
        }),
      ];
    }
    if (detail === 'depth') {
      return SEARCH_DEPTHS.map((depth, i) =>
        row({
          key: depth.mode,
          icon: DEPTH_ICONS[depth.icon],
          title: depth.label,
          value: depth.description,
          onPress: () => {
            setSearchMode(depth.mode);
            setDetail(null);
          },
          selected: searchMode === depth.mode,
          last: i === SEARCH_DEPTHS.length - 1,
        })
      );
    }
    if (detail === 'model') {
      const options = [AUTO_MODEL_OPTION, ...models];
      return options.map((model, i) =>
        row({
          key: model.id,
          icon: model.id === AUTO_MODEL_ID ? 'sparkles-outline' : 'hardware-chip-outline',
          title: model.name,
          value: model.description,
          onPress: () => {
            setSelectedModel(model.id);
            setDetail(null);
          },
          selected: (selectedModel ?? AUTO_MODEL_ID) === model.id,
          last: i === options.length - 1,
        })
      );
    }
    // Connectors: picking the pinned one again unpins it, as on web.
    return connectors.map((connector, i) => {
      const id = connectorId(connector);
      const isPinned = pinnedConnector?.id === id;
      return row({
        key: connector.identifier,
        icon: 'link-outline',
        title: connector.title,
        onPress: () => {
          setPinnedConnector(isPinned ? null : { id, label: connector.title });
          setDetail(null);
        },
        selected: isPinned,
        last: i === connectors.length - 1,
      });
    });
  };

  const hasAttachments = !!(onTakePhoto || onPickImage || onPickFile || onOpenDocBrowser);

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      backgroundColor={isDark ? theme.background : theme.surface}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => (detail ? setDetail(null) : close())}
          hitSlop={10}
          style={styles.headerButton}
          accessibilityLabel={detail ? 'Zurück' : 'Schließen'}
        >
          <Ionicons name={detail ? 'chevron-back' : 'close'} size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {detail ? DETAIL_TITLES[detail] : 'Zum Chat hinzufügen'}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {detail ? (
          <View style={[styles.group, cardStyle]}>{detailRows()}</View>
        ) : (
          <>
            {hasAttachments && (
              <View style={styles.tiles}>
                {onTakePhoto && tile('camera-outline', 'Kamera', onTakePhoto)}
                {onPickImage && tile('image-outline', 'Fotos', onPickImage)}
                {onPickFile && tile('document-attach-outline', 'Dateien', onPickFile)}
                {onOpenDocBrowser && tile('folder-open-outline', 'Dokumente', onOpenDocBrowser)}
              </View>
            )}

            {onInsertMention && (
              <View style={[styles.group, cardStyle]}>
                {row({
                  key: 'skills',
                  icon: 'color-wand-outline',
                  title: 'Rezepte',
                  value: skills.map((s) => s.title).join(' · '),
                  onPress: () => setDetail('skills'),
                })}
                {row({
                  key: 'functions',
                  icon: 'flash-outline',
                  title: 'Funktionen',
                  value: functions.map((f) => f.title).join(' · '),
                  onPress: () => setDetail('functions'),
                  last: true,
                })}
              </View>
            )}

            <View style={[styles.group, cardStyle]}>
              {row({
                key: 'mode',
                icon: MODE_ICONS[activeMode.icon],
                title: 'Modus',
                value: activeMode.label,
                onPress: () => setDetail('mode'),
              })}
              {threadMode === 'notebook' &&
                row({
                  key: 'notebook',
                  icon: 'book-outline',
                  title: 'Notebook',
                  value: activeNotebook?.title ?? 'Auswählen',
                  onPress: () => setDetail('notebook'),
                })}
              {showsSearchDepth(selectedAgentId) &&
                row({
                  key: 'depth',
                  icon: DEPTH_ICONS[activeDepth.icon],
                  title: 'Recherchetiefe',
                  value: activeDepth.label,
                  onPress: () => setDetail('depth'),
                })}
              {row({
                key: 'model',
                icon: 'hardware-chip-outline',
                title: 'Modell',
                value: activeModel,
                onPress: () => setDetail('model'),
                last: true,
              })}
            </View>

            {connectors.length > 0 && (
              <View style={[styles.group, cardStyle]}>
                {row({
                  key: 'connectors',
                  icon: 'link-outline',
                  title: 'Konnektoren',
                  value: pinnedConnector?.label ?? 'Keiner angeheftet',
                  onPress: () => setDetail('connectors'),
                  last: true,
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.medium,
  },
  headerButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Raleway_700Bold',
    fontSize: 22,
  },
  content: {
    paddingHorizontal: spacing.medium,
    gap: spacing.medium,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small + 2,
    borderRadius: borderRadius.large,
  },
  tileBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    ...chatType.chatSecondary,
  },
  group: {
    borderRadius: borderRadius.large,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.small,
    paddingVertical: 12,
  },
  rowBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: BODY_FONT,
    fontSize: 17,
  },
  rowValue: {
    ...chatType.chatSecondary,
    marginTop: 1,
  },
  trailingSpacer: {
    width: 22,
  },
  pressed: {
    opacity: 0.6,
  },
});
