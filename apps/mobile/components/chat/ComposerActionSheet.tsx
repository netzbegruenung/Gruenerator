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
  COMPOSER_TOOLS,
  resolveMentionable,
  // notebookMentionables — Notizbuchmodus vorerst nicht weiterverfolgt (08/2026).
  useSkillFavoritesStore,
  type ComposerIconKey,
  type ComposerToolIconKey,
  type Mentionable,
  type SearchDepthIconKey,
} from '@gruenerator/chat';
import { isModelEnabledByDefault } from '@gruenerator/shared/models';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { memo, useCallback, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  useColorScheme,
} from 'react-native';
import { useShallow } from 'zustand/shallow';

import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, chatType } from '../../theme';
import { route } from '../../types/routes';
import { BottomSheet } from '../common/BottomSheet';
import { ListGroup, ListRow, useSurfaceStyles } from '../common/ListRow';

// Presentation only: labels and keys come from the shared COMPOSER_MODES /
// SEARCH_DEPTHS lists; these map the semantic icon keys → Ionicons.
const MODE_ICONS: Record<ComposerIconKey, IoniconsIconName> = {
  chat: 'chatbubble-outline',
  notebook: 'book-outline',
  custom: 'settings-outline',
};

const TOOL_ICONS: Record<ComposerToolIconKey, IoniconsIconName> = {
  globe: 'globe-outline',
  research: 'telescope-outline',
  document: 'document-text-outline',
};

const DEPTH_ICONS: Record<SearchDepthIconKey, IoniconsIconName> = {
  fast: 'flash-outline',
  deep: 'telescope-outline',
};

/** Which detail list the sheet is showing; `null` is the root. */
type Detail = 'mode' | 'skills' | 'functions' | 'depth' | 'model' | 'connectors';

const DETAIL_TITLES: Record<Detail, string> = {
  mode: 'Modus',
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
 * Content follows web section for section, including the switch group: these
 * toggles were removed here once as "mobile-only drift" because web had none —
 * the wrong direction, since `enabledTools` was wired end to end the whole time
 * and simply had no UI on either platform. They render from the shared
 * `COMPOSER_TOOLS`, so the set cannot diverge again. Recherchetiefe follows the shared
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
    pinnedConnector,
    customSystemPrompt,
  } = useAgentStore(
    useShallow((s) => ({
      selectedAgentId: s.selectedAgentId,
      selectedModel: s.selectedModel,
      searchMode: s.searchMode,
      threadMode: s.threadMode,
      pinnedConnector: s.pinnedConnector,
      customSystemPrompt: s.customSystemPrompt,
    }))
  );
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const setSearchMode = useAgentStore((s) => s.setSearchMode);
  const setThreadMode = useAgentStore((s) => s.setThreadMode);
  const setPinnedConnector = useAgentStore((s) => s.setPinnedConnector);
  const enabledTools = useAgentStore((s) => s.enabledTools);
  const toggleTool = useAgentStore((s) => s.toggleTool);

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

  const { card: cardStyle, badge: badgeStyle } = useSurfaceStyles();

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

  const detailRows = (): ReactNode => {
    if (detail === 'mode') {
      return modes.map((mode, i) => (
        <ListRow
          key={mode.mode}
          icon={MODE_ICONS[mode.icon]}
          title={mode.label}
          onPress={() => {
            setThreadMode(mode.mode);
            setDetail(null);
          }}
          selected={threadMode === mode.mode}
          last={i === modes.length - 1}
        />
      ));
    }
    // NOTIZBUCHMODUS — vorerst nicht weiterverfolgt (08/2026), siehe
    // `COMPOSER_MODES` in `packages/chat/src/lib/composerControls.ts`. Die
    // Auswahl ist stillgelegt, der Transportweg nicht: der Einstieg aus einem
    // Notizbuch (`chat-conversation.tsx`) setzt den Modus weiterhin selbst.
    // if (detail === 'notebook') {
    //   return notebookMentionables.map((notebook, i) => (
    //     <ListRow
    //       key={notebook.identifier}
    //       icon="book-outline"
    //       title={notebook.title}
    //       onPress={() => {
    //         setSelectedNotebook(notebook.identifier);
    //         setThreadMode('notebook');
    //         setDetail(null);
    //       }}
    //       selected={selectedNotebookId === notebook.identifier}
    //       last={i === notebookMentionables.length - 1}
    //     />
    //   ));
    // }
    if (detail === 'skills' || detail === 'functions') {
      const list = detail === 'skills' ? skills : functions;
      const rows = list.map((item, i) => (
        // `mention`, not `identifier`: eighteen recipes share eight owning-agent
        // identifiers, so keying on those collides.
        <ListRow
          key={item.mention}
          icon={detail === 'skills' ? 'color-wand-outline' : 'flash-outline'}
          title={item.title}
          value={item.description}
          onPress={() => runAction(() => onInsertMention?.(item))}
          last={detail === 'skills' ? false : i === list.length - 1}
        />
      ));
      if (detail === 'functions') return rows;
      // Web closes its recipe submenu with two entries — a search across all
      // recipes and a link to the library. On mobile the Agentura screen is both,
      // so it is one row.
      return [
        ...rows,
        <ListRow
          key="all-recipes"
          icon="library-outline"
          title="Alle Rezepte"
          value="In der Agentura durchsuchen"
          onPress={() => runAction(() => router.push(route('/(focused)/agents')))}
          last
        />,
      ];
    }
    if (detail === 'depth') {
      return SEARCH_DEPTHS.map((depth, i) => (
        <ListRow
          key={depth.mode}
          icon={DEPTH_ICONS[depth.icon]}
          title={depth.label}
          value={depth.description}
          onPress={() => {
            setSearchMode(depth.mode);
            setDetail(null);
          }}
          selected={searchMode === depth.mode}
          last={i === SEARCH_DEPTHS.length - 1}
        />
      ));
    }
    if (detail === 'model') {
      const options = [AUTO_MODEL_OPTION, ...models];
      return options.map((model, i) => (
        <ListRow
          key={model.id}
          icon={model.id === AUTO_MODEL_ID ? 'sparkles-outline' : 'hardware-chip-outline'}
          title={model.name}
          {...(model.id === AUTO_MODEL_ID && {
            titleBadge: AUTO_MODEL_OPTION.recommendedLabel,
          })}
          value={model.description}
          onPress={() => {
            setSelectedModel(model.id);
            setDetail(null);
          }}
          selected={(selectedModel ?? AUTO_MODEL_ID) === model.id}
          last={i === options.length - 1}
        />
      ));
    }
    // Connectors: picking the pinned one again unpins it, as on web.
    return connectors.map((connector, i) => {
      const id = connectorId(connector);
      const isPinned = pinnedConnector?.id === id;
      return (
        <ListRow
          key={connector.identifier}
          icon="link-outline"
          title={connector.title}
          onPress={() => {
            setPinnedConnector(isPinned ? null : { id, label: connector.title });
            setDetail(null);
          }}
          selected={isPinned}
          last={i === connectors.length - 1}
        />
      );
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
          <ListGroup>{detailRows()}</ListGroup>
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
              <ListGroup>
                <ListRow
                  icon="color-wand-outline"
                  title="Rezepte"
                  value={skills.map((s) => s.title).join(' · ')}
                  onPress={() => setDetail('skills')}
                />
                <ListRow
                  icon="flash-outline"
                  title="Funktionen"
                  value={functions.map((f) => f.title).join(' · ')}
                  onPress={() => setDetail('functions')}
                  last
                />
              </ListGroup>
            )}

            <ListGroup>
              <ListRow
                icon={MODE_ICONS[activeMode.icon]}
                title="Modus"
                value={activeMode.label}
                onPress={() => setDetail('mode')}
              />
              {/* NOTIZBUCHMODUS — vorerst nicht weiterverfolgt (08/2026).
                  Siehe `COMPOSER_MODES`. */}
              {/* {threadMode === 'notebook' && (
                <ListRow
                  icon="book-outline"
                  title="Notebook"
                  value={activeNotebook?.title ?? 'Auswählen'}
                  onPress={() => setDetail('notebook')}
                />
              )} */}
              {showsSearchDepth(selectedAgentId) && (
                <ListRow
                  icon={DEPTH_ICONS[activeDepth.icon]}
                  title="Recherchetiefe"
                  value={activeDepth.label}
                  onPress={() => setDetail('depth')}
                />
              )}
              <ListRow
                icon="hardware-chip-outline"
                title="Modell"
                value={activeModel}
                onPress={() => setDetail('model')}
                last
              />
            </ListGroup>

            {connectors.length > 0 && (
              <ListGroup>
                <ListRow
                  icon="link-outline"
                  title="Konnektoren"
                  value={pinnedConnector?.label ?? 'Keiner angeheftet'}
                  onPress={() => setDetail('connectors')}
                  last
                />
              </ListGroup>
            )}

            <ListGroup>
              {COMPOSER_TOOLS.map((tool, i) => {
                const last = i === COMPOSER_TOOLS.length - 1;
                if (tool.kind === 'toggle') {
                  return (
                    <ListRow
                      key={tool.key}
                      icon={TOOL_ICONS[tool.icon]}
                      title={tool.label}
                      value={tool.description}
                      last={last}
                      onPress={() => toggleTool(tool.key)}
                      accessory={
                        <Switch
                          value={enabledTools[tool.key] !== false}
                          onValueChange={() => toggleTool(tool.key)}
                        />
                      }
                    />
                  );
                }
                const mentionable = resolveMentionable(tool.mention);
                if (!mentionable || !onInsertMention) return null;
                return (
                  <ListRow
                    key={tool.mention}
                    icon={TOOL_ICONS[tool.icon]}
                    title={tool.label}
                    value={tool.description}
                    last={last}
                    onPress={() => runAction(() => onInsertMention(mentionable))}
                  />
                );
              })}
            </ListGroup>
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
  pressed: {
    opacity: 0.6,
  },
});
