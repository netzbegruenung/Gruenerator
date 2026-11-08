import * as Haptics from 'expo-haptics';
import { memo, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { getLandesverbandPhoto } from '../../config/landesverbandPhotos';
import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';
import { useLayout } from '../../hooks/useLayout';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, useDashboardColors } from '../../theme';
import { PressableCard } from '../dashboard/PressableCard';
import { NotebookTile } from '../notebook/NotebookTile';

import { CARD_GAP } from './WissenLayout';

import type { Shelf, ShelfCollection, ShelfEntry } from './useNotebookShelves';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Wohin eine Kachel oder ein Eintrag führt: `/notebook/[id]`. */
export interface NotebookTarget {
  id: string;
  title: string;
}

/** Was ein Listeneintrag zeigt und wohin er führt — je Art an genau einer Stelle. */
function describeEntry(entry: ShelfEntry): NotebookTarget & { meta: string } {
  switch (entry.kind) {
    case 'system':
      return { id: entry.notebook.id, title: entry.notebook.title, meta: entry.notebook.meta };
    case 'own': {
      const c = entry.collection;
      return { id: c.id, title: c.name, meta: plural(c.document_count, 'Quelle', 'Quellen') };
    }
    case 'shared': {
      const c = entry.collection;
      // Der Projektname unterscheidet zwei gleichnamige geteilte Notebooks.
      const via = c.shared_via_groups?.length ? ` via ${c.shared_via_groups.join(', ')}` : '';
      return { id: c.id, title: c.name, meta: `Geteilt${via}` };
    }
    case 'saved':
      return {
        id: entry.item.ref,
        title: entry.item.title,
        meta: entry.item.authorName ? `Gemerkt · von ${entry.item.authorName}` : 'Gemerkt',
      };
  }
}

/** Kachel-Inhalt: Name und Zeile unten; `meta: null` = die Zählung lädt noch. */
function TileText({
  title,
  meta,
  titleSize,
}: {
  title: string;
  meta: string | null;
  titleSize: number;
}) {
  const c = useDashboardColors();
  return (
    <View style={styles.tileText}>
      <Text
        style={[
          styles.tileTitle,
          { color: c.mgInk, fontSize: titleSize, lineHeight: titleSize * 1.2 },
        ]}
      >
        {title}
      </Text>
      {meta === null ? (
        <View style={[styles.metaBone, { backgroundColor: c.mgTint2 }]} />
      ) : (
        <Text style={[styles.tileMeta, { color: c.mgSub }]}>{meta}</Text>
      )}
    </View>
  );
}

/** Eine Kachel. `memo` mit stabilen Handlern: beim Aufklappen rendern nur die alte und die neue offene. */
const ShelfTile = memo(function ShelfTile({
  shelf,
  isOpen,
  onToggle,
  onOpen,
  onCreate,
}: {
  shelf: Shelf;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onOpen: (target: NotebookTarget) => void;
  onCreate: () => void;
}) {
  const c = useDashboardColors();
  const style = [
    styles.tile,
    { backgroundColor: c.mgTint },
    isOpen ? { boxShadow: `inset 0 0 0 2px ${c.mg}` } : null,
  ];
  const label = shelf.meta ? `${shelf.title}, ${shelf.meta}` : shelf.title;
  const onPress = () => {
    if (shelf.kind === 'group') onToggle(shelf.id);
    else if (shelf.kind === 'notebook')
      onOpen({ id: shelf.notebook.id, title: shelf.notebook.title });
    else onCreate();
  };
  return (
    <PressableCard
      onPress={onPress}
      style={style}
      containerStyle={styles.tileSlot}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={shelf.kind === 'group' ? { expanded: isOpen } : undefined}
    >
      <TileText title={shelf.title} meta={shelf.meta} titleSize={17} />
    </PressableCard>
  );
});

/** Ein Eintrag der aufgeklappten Liste — eine kleinere Ausgabe der Kachel darüber. */
const EntryCard = memo(function EntryCard({
  entry,
  onOpen,
  onOwnActions,
}: {
  entry: ShelfEntry;
  onOpen: (target: NotebookTarget) => void;
  onOwnActions: (collection: ShelfCollection) => void;
}) {
  const c = useDashboardColors();
  const { id, title, meta } = describeEntry(entry);
  return (
    <PressableCard
      onPress={() => onOpen({ id, title })}
      onLongPress={entry.kind === 'own' ? () => onOwnActions(entry.collection) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      accessibilityHint={entry.kind === 'own' ? 'Lange drücken für Teilen und Löschen' : undefined}
      style={[styles.tile, { backgroundColor: c.mgTint }]}
      containerStyle={styles.tileSlot}
    >
      <TileText title={title} meta={meta} titleSize={15} />
    </PressableCard>
  );
});

/** Ein Landesverband als Fotokarte — dasselbe Foto wie im Marktplatz; ohne Foto die Textkachel. */
const PhotoEntry = memo(function PhotoEntry({
  entry,
  size,
  onOpen,
}: {
  entry: ShelfEntry;
  size: number;
  onOpen: (target: NotebookTarget) => void;
}) {
  if (entry.kind !== 'system') return null;
  const nb = entry.notebook;
  return (
    <NotebookTile
      title={nb.title}
      meta={nb.meta}
      icon={nb.icon}
      photo={getLandesverbandPhoto(nb.id)}
      size={size}
      onPress={() => onOpen({ id: nb.id, title: nb.title })}
    />
  );
});

type GroupShelf = Extract<Shelf, { kind: 'group' }>;

/** Die aufgeklappte Liste einer Gruppe. `memo`: rendert nur, wenn eine andere Gruppe aufgeht. */
const ShelfPanel = memo(function ShelfPanel({
  shelf,
  onOpen,
  onOwnActions,
}: {
  shelf: GroupShelf;
  onOpen: (target: NotebookTarget) => void;
  onOwnActions: (collection: ShelfCollection) => void;
}) {
  const { gridWidth } = useLayout();
  const reduceMotion = useReduceMotion();
  // Die nächste Karte bleibt halb sichtbar, damit das Scrollen zu erkennen ist.
  const photoSize = Math.round((gridWidth - 2 * CARD_GAP) / 2.5);
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(200)}
      exiting={reduceMotion ? undefined : FadeOut.duration(150)}
      accessibilityLabel={shelf.title}
    >
      {shelf.layout === 'photos' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRow}
        >
          {shelf.entries.map((entry) => (
            <PhotoEntry key={entry.key} entry={entry} size={photoSize} onOpen={onOpen} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.grid}>
          {shelf.entries.map((entry) => (
            <EntryCard key={entry.key} entry={entry} onOpen={onOpen} onOwnActions={onOwnActions} />
          ))}
        </View>
      )}
    </Animated.View>
  );
});

/**
 * Kacheln und aufgeklappte Liste mit dem Klappzustand. Er liegt hier statt in
 * `NotebookShelf`, damit Überschrift und „Neues erstellen“ beim Auf- und Zuklappen
 * nicht mitrendern. Immer nur eine Gruppe ist offen.
 */
function ShelfBrowser({
  shelves,
  onOpen,
  onCreate,
  onOwnActions,
}: {
  shelves: Shelf[];
  onOpen: (target: NotebookTarget) => void;
  onCreate: () => void;
  onOwnActions: (collection: ShelfCollection) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = useCallback((id: string) => {
    void Haptics.selectionAsync();
    setOpenId((cur) => (cur === id ? null : id));
  }, []);
  const open = shelves.find((s): s is GroupShelf => s.id === openId && s.kind === 'group') ?? null;
  return (
    <View style={styles.browser}>
      <Animated.View layout={LinearTransition} style={styles.grid}>
        {shelves.map((shelf) => (
          <ShelfTile
            key={shelf.id}
            shelf={shelf}
            isOpen={open?.id === shelf.id}
            onToggle={toggle}
            onOpen={onOpen}
            onCreate={onCreate}
          />
        ))}
      </Animated.View>
      {open ? (
        <ShelfPanel key={open.id} shelf={open} onOpen={onOpen} onOwnActions={onOwnActions} />
      ) : null}
    </View>
  );
}

/**
 * „Deine Notebooks“: Kacheln für die Notebook-Gruppen. Eine Gruppe klappt darunter
 * ihre Liste auf (immer nur eine; die Landesverbände als Fotoreihe), ein einzelnes
 * Notebook öffnet direkt.
 */
export function NotebookShelf({
  shelves,
  onOpen,
  onCreate,
  onOwnActions,
}: {
  shelves: Shelf[];
  onOpen: (target: NotebookTarget) => void;
  onCreate: () => void;
  onOwnActions: (collection: ShelfCollection) => void;
}) {
  const theme = useTheme();
  const c = useDashboardColors();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
          Deine Notebooks
        </Text>
        <Pressable
          onPress={onCreate}
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 0 }}
          style={styles.create}
        >
          <Text style={[styles.createText, { color: c.mg }]}>Neues erstellen</Text>
        </Pressable>
      </View>
      <ShelfBrowser
        shelves={shelves}
        onOpen={onOpen}
        onCreate={onCreate}
        onOwnActions={onOwnActions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  heading: { fontFamily: HEADING_FONT_BOLD, fontSize: 19 },
  create: { justifyContent: 'center' },
  createText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700' },
  browser: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  // Zwei Spalten in Handybreite; eine einzelne Kachel bleibt halb breit, wie im Web.
  tileSlot: { flexBasis: '45%', flexGrow: 1, maxWidth: '50%' },
  tile: {
    minHeight: 84,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  tileText: { gap: 2 },
  tileTitle: { fontFamily: HEADING_FONT_BOLD },
  tileMeta: { fontFamily: BODY_FONT, fontSize: 13 },
  metaBone: { width: 96, height: 14, borderRadius: 6 },
  photoRow: { gap: CARD_GAP, paddingBottom: 4 },
});
