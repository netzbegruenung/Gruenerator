import { type CreateAttachment } from '@assistant-ui/react-native';
import {
  buildConnectAttachment,
  buildWebpageAttachment,
  buildWolkeAttachment,
  canvaDesignsMarkdown,
  isWolkeRoot,
  normalizeWebpageUrl,
  joinWolkePath,
  useCanvaDesignsQuery,
  useConnectBrowseQuery,
  useConnectProvidersQuery,
  useUserShareLinksQuery,
  useWolkeBrowseQuery,
  wolkeParentPath,
  type CanvaDesignToken,
  type ConnectFileToken,
  type WolkeFileToken,
} from '@gruenerator/chat';
import { ApiError } from '@gruenerator/shared/api';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { colors, spacing, borderRadius, chatType } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { SkeletonRows } from '../common/Skeleton';

import type { Theme } from '../../theme/colors';

/** Which source the sheet is browsing. */
export type MentionPickerSource = 'wolke' | 'connect' | 'canva' | 'webpage';

const TITLES: Record<MentionPickerSource, string> = {
  wolke: 'Aus der Cloud',
  connect: 'Aus der Cloud',
  canva: 'Canva-Designs',
  webpage: 'Link anhängen',
};

const EMPTY_HINTS: Record<MentionPickerSource, string> = {
  wolke: 'Keine Ablage verbunden. Verbindungen richtest du im Profil ein.',
  connect: 'Keine Ablage verbunden. Verbindungen richtest du im Profil ein.',
  canva: 'Canva ist nicht verbunden. Verbindungen richtest du im Profil ein.',
  // Never shown: the webpage body is an input, not a list, so it has nothing
  // to be empty of. The record is exhaustive so a new source cannot forget one.
  webpage: '',
};

function Row({
  icon,
  label,
  detail,
  selected,
  disabled = false,
  theme,
  onPress,
}: {
  icon: IoniconsIconName;
  label: string;
  detail?: string | null;
  selected?: boolean;
  /** A file the chat cannot read: shown, but not pickable. */
  disabled?: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.surface : 'transparent', opacity: disabled ? 0.45 : 1 },
      ]}
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
    >
      <Ionicons
        name={selected ? 'checkmark-circle' : icon}
        size={20}
        color={selected ? colors.primary[500] : theme.textSecondary}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.rowDetail, { color: theme.textSecondary }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Status({
  loading,
  empty,
  hint,
  theme,
}: {
  loading: boolean;
  empty: boolean;
  hint: string;
  theme: Theme;
}) {
  if (loading) return <SkeletonRows count={4} leading={32} meta={false} />;
  if (!empty) return null;
  return <Text style={[styles.hint, { color: theme.textSecondary }]}>{hint}</Text>;
}

type CloudSource = { kind: 'wolke' | 'drive'; id: string; label: string };

const DRIVE_LABELS: Record<string, string> = { microsoft: 'OneDrive', google: 'Google Drive' };

/**
 * Wolke-Freigaben und verbundene Laufwerke in einer Ansicht, wie web's
 * `CloudFileBrowser`: Chips wählen die Ablage, darunter Ordner und Dateien.
 * `@wolke` wählt die Wolke vor, `@connect` das erste Laufwerk; gesammelt wird
 * über alle Ablagen hinweg.
 */
function CloudBody({
  theme,
  prefer,
  wolkeSelection,
  connectSelection,
  onToggleWolke,
  onToggleConnect,
}: {
  theme: Theme;
  prefer: 'wolke' | 'drive';
  wolkeSelection: Map<string, WolkeFileToken>;
  connectSelection: Map<string, ConnectFileToken>;
  onToggleWolke: (file: WolkeFileToken) => void;
  onToggleConnect: (file: ConnectFileToken) => void;
}) {
  const shareLinks = useUserShareLinksQuery(true);
  const providers = useConnectProvidersQuery(true);
  const sources = useMemo<CloudSource[]>(
    () => [
      ...(shareLinks.data ?? []).map((l) => ({
        kind: 'wolke' as const,
        id: l.id,
        label: l.label ?? 'Wolke',
      })),
      ...(providers.data ?? []).map((p) => ({
        kind: 'drive' as const,
        id: p.provider,
        label: DRIVE_LABELS[p.provider] ?? p.label,
      })),
    ],
    [shareLinks.data, providers.data]
  );

  const [chosen, setChosen] = useState<CloudSource | null>(null);
  const [path, setPath] = useState('');
  const [trail, setTrail] = useState<string[]>([]);
  const active = chosen ?? sources.find((s) => s.kind === prefer) ?? sources[0] ?? null;

  const wolke = useWolkeBrowseQuery(
    active?.kind === 'wolke' ? active.id : null,
    path,
    active?.kind === 'wolke'
  );
  const drive = useConnectBrowseQuery(
    active?.kind === 'drive' ? active.id : null,
    trail.at(-1) ?? null,
    active?.kind === 'drive'
  );

  if (shareLinks.isLoading || providers.isLoading) {
    return <Status loading empty={false} hint="" theme={theme} />;
  }
  if (!active) return <Status loading={false} empty hint={EMPTY_HINTS.wolke} theme={theme} />;

  const atRoot = active.kind === 'wolke' ? isWolkeRoot(path) : trail.length === 0;
  const loading = active.kind === 'wolke' ? wolke.isLoading : drive.isLoading;
  const expired =
    active.kind === 'drive' && drive.error instanceof ApiError && drive.error.status === 403;

  return (
    <>
      {sources.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {sources.map((source) => {
            const selected = source.kind === active.kind && source.id === active.id;
            return (
              <Pressable
                key={`${source.kind}:${source.id}`}
                onPress={() => {
                  setChosen(source);
                  setPath('');
                  setTrail([]);
                }}
                style={[
                  styles.chip,
                  {
                    borderColor: selected ? colors.primary[500] : theme.border,
                    backgroundColor: selected ? theme.surface : 'transparent',
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
                  {source.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {!atRoot ? (
        <Row
          icon="arrow-up-outline"
          label="Eine Ebene höher"
          theme={theme}
          onPress={() =>
            active.kind === 'wolke' ? setPath(wolkeParentPath(path)) : setTrail(trail.slice(0, -1))
          }
        />
      ) : null}

      {loading ? <Status loading empty={false} hint="" theme={theme} /> : null}
      {expired ? (
        <Status
          loading={false}
          empty
          hint={`Der Zugang zu ${active.label} ist abgelaufen. Bitte verbinde das Konto neu.`}
          theme={theme}
        />
      ) : null}

      {active.kind === 'wolke'
        ? (wolke.data?.files ?? []).map((file) => {
            const filePath = joinWolkePath(path, file.name);
            const key = `${active.id}:${filePath}`;
            return (
              <Row
                key={key}
                icon={file.isDirectory ? 'folder-outline' : 'document-outline'}
                label={file.name}
                detail={file.isDirectory ? null : (file.sizeFormatted ?? null)}
                disabled={!file.isDirectory && file.isSupported === false}
                theme={theme}
                {...(file.isDirectory ? {} : { selected: wolkeSelection.has(key) })}
                onPress={() => {
                  if (file.isDirectory) {
                    setPath(filePath);
                    return;
                  }
                  onToggleWolke({ shareLinkId: active.id, path: filePath, name: file.name });
                }}
              />
            );
          })
        : (drive.data ?? []).map((file) => {
            const key = `${active.id}:${file.id}`;
            return (
              <Row
                key={key}
                icon={file.isDirectory ? 'folder-outline' : 'document-outline'}
                label={file.name}
                detail={file.sizeFormatted ?? null}
                disabled={!file.isDirectory && file.isSupported === false}
                theme={theme}
                {...(file.isDirectory ? {} : { selected: connectSelection.has(key) })}
                onPress={() => {
                  if (file.isDirectory) {
                    setTrail([...trail, file.id]);
                    return;
                  }
                  onToggleConnect({
                    provider: active.id,
                    fileId: file.id,
                    name: file.name,
                    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
                  });
                }}
              />
            );
          })}
    </>
  );
}

/** Canva: a flat list of the user's designs. */
function CanvaBody({
  theme,
  selection,
  onToggle,
}: {
  theme: Theme;
  selection: Map<string, CanvaDesignToken>;
  onToggle: (design: CanvaDesignToken) => void;
}) {
  const { data, isLoading } = useCanvaDesignsQuery('', true);
  const designs = data?.designs ?? [];

  if (isLoading) return <Status loading empty={false} hint="" theme={theme} />;
  if (designs.length === 0) {
    return <Status loading={false} empty hint={EMPTY_HINTS.canva} theme={theme} />;
  }

  return (
    <>
      {designs.map((design) => (
        <Row
          key={design.id}
          icon="color-palette-outline"
          label={design.title}
          theme={theme}
          selected={selection.has(design.id)}
          onPress={() => onToggle({ id: design.id, title: design.title, viewUrl: design.viewUrl })}
        />
      ))}
    </>
  );
}

/**
 * A URL typed by hand. Unlike the other three this is an input, not a browse
 * list — and unlike them it needs no connected account, so it is the one picker
 * that always works. Auto-detection of URLs typed straight into the message is
 * unchanged and remains the common path; this is the explicit shortcut.
 */
function WebpageBody({
  theme,
  value,
  onChange,
}: {
  theme: Theme;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.urlWrap}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="https://example.org/artikel"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        accessibilityLabel="Adresse der Webseite"
        style={[styles.urlInput, { color: theme.text, borderColor: theme.border }]}
      />
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Der Inhalt der Seite wird gelesen und als Kontext angehängt.
      </Text>
    </View>
  );
}

/**
 * The typed `@`-mention pickers — cloud storage (Wolke + connected drives),
 * Canva, a link — as one sheet. Web has three separate floating popovers; on a phone
 * they are the same gesture and the same list, so they are the same surface.
 *
 * Wolke and Connect picks become **attachments**; Canva picks become a markdown
 * link in the draft. Both shapes come from `@gruenerator/chat` rather than being
 * rebuilt here — the backend recognises a mention only by an exact
 * contentType/kind pair, and a mismatch fails silently.
 */
export const MentionPickerSheet = memo(function MentionPickerSheet({
  source,
  theme,
  onClose,
  onAttach,
  onInsertText,
}: {
  source: MentionPickerSource | null;
  theme: Theme;
  onClose: () => void;
  onAttach: (attachment: CreateAttachment) => void;
  onInsertText: (markdown: string) => void;
}) {
  const [wolke, setWolke] = useState<Map<string, WolkeFileToken>>(new Map());
  const [connect, setConnect] = useState<Map<string, ConnectFileToken>>(new Map());
  const [canva, setCanva] = useState<Map<string, CanvaDesignToken>>(new Map());
  const [webpageUrl, setWebpageUrl] = useState('');

  // The URL counts as "one pick" only once it parses, so the confirm button
  // cannot be pressed on a half-typed address.
  const normalizedUrl = normalizeWebpageUrl(webpageUrl);
  const count = wolke.size + connect.size + canva.size + (normalizedUrl ? 1 : 0);

  const reset = useCallback(() => {
    setWolke(new Map());
    setConnect(new Map());
    setCanva(new Map());
    setWebpageUrl('');
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const toggleWolke = useCallback((file: WolkeFileToken) => {
    setWolke((prev) => {
      const next = new Map(prev);
      const key = `${file.shareLinkId}:${file.path}`;
      if (next.has(key)) next.delete(key);
      else next.set(key, file);
      return next;
    });
  }, []);

  const toggleConnect = useCallback((file: ConnectFileToken) => {
    setConnect((prev) => {
      const next = new Map(prev);
      const key = `${file.provider}:${file.fileId}`;
      if (next.has(key)) next.delete(key);
      else next.set(key, file);
      return next;
    });
  }, []);

  const toggleCanva = useCallback((design: CanvaDesignToken) => {
    setCanva((prev) => {
      const next = new Map(prev);
      if (next.has(design.id)) next.delete(design.id);
      else next.set(design.id, design);
      return next;
    });
  }, []);

  const confirm = useCallback(() => {
    for (const file of wolke.values()) onAttach(buildWolkeAttachment(file));
    for (const file of connect.values()) onAttach(buildConnectAttachment(file));
    if (normalizedUrl) onAttach(buildWebpageAttachment(normalizedUrl));
    const markdown = canvaDesignsMarkdown([...canva.values()]);
    if (markdown) onInsertText(markdown);
    close();
  }, [wolke, connect, canva, normalizedUrl, onAttach, onInsertText, close]);

  const body = useMemo(() => {
    switch (source) {
      case 'wolke':
      case 'connect':
        return (
          <CloudBody
            theme={theme}
            prefer={source === 'wolke' ? 'wolke' : 'drive'}
            wolkeSelection={wolke}
            connectSelection={connect}
            onToggleWolke={toggleWolke}
            onToggleConnect={toggleConnect}
          />
        );
      case 'canva':
        return <CanvaBody theme={theme} selection={canva} onToggle={toggleCanva} />;
      case 'webpage':
        return <WebpageBody theme={theme} value={webpageUrl} onChange={setWebpageUrl} />;
      default:
        return null;
    }
  }, [source, theme, wolke, connect, canva, webpageUrl, toggleWolke, toggleConnect, toggleCanva]);

  return (
    <BottomSheet visible={source != null} onClose={close} maxHeight="80%">
      <Text style={[styles.title, { color: theme.text }]}>{source ? TITLES[source] : ''}</Text>
      <ScrollView>{body}</ScrollView>
      {count > 0 ? (
        <Pressable
          onPress={confirm}
          style={styles.confirm}
          testID="mention-picker-confirm"
          accessibilityRole="button"
        >
          <Text style={styles.confirmText}>
            {count === 1 ? '1 Element übernehmen' : `${count} Elemente übernehmen`}
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  title: {
    ...chatType.chatBody,
    fontWeight: '700',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
  },
  hint: {
    ...chatType.chatSecondary,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.medium,
  },
  chipRow: {
    flexGrow: 0,
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.xsmall,
  },
  chip: {
    borderWidth: 1,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.small,
    paddingVertical: 4,
    marginRight: spacing.xxsmall,
  },
  chipText: {
    ...chatType.chatLabel,
    maxWidth: 160,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    ...chatType.chatBody,
  },
  rowDetail: {
    ...chatType.chatMeta,
  },
  urlWrap: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
  },
  urlInput: {
    ...chatType.chatBody,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
  },
  confirm: {
    margin: spacing.medium,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.small,
    alignItems: 'center',
  },
  confirmText: {
    ...chatType.chatTitle,
    color: colors.white,
    fontWeight: '700',
  },
});
