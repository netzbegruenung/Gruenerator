import { templates, type DocumentTemplate } from '@gruenerator/docs/templates';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';

import { lightTheme, darkTheme, colors, spacing, borderRadius } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { officeIconFor, type OfficeItem } from '../office/officeItem';

const TEMPLATE_ICONS: Record<string, IoniconsIconName> = {
  blank: 'document-outline',
  antrag: 'clipboard-outline',
  pressemitteilung: 'newspaper-outline',
  protokoll: 'create-outline',
  notizen: 'bulb-outline',
  redaktionsplan: 'calendar-outline',
  checkliste: 'checkbox-outline',
  einladung: 'mail-outline',
  tabelle: 'grid-outline',
};

// Mirrors packages/docs AIDocumentCreator's presets so mobile and web offer the
// same starting points. (Web's list is local to that component; kept in sync here.)
const EXAMPLE_PROMPTS = [
  { label: 'Pressemitteilung', text: 'Pressemitteilung zum Klimaschutz in unserer Kommune' },
  { label: 'Antrag', text: 'Antrag für den Kreisparteitag zum Thema nachhaltige Mobilität' },
  { label: 'Protokoll', text: 'Protokoll der letzten Vorstandssitzung' },
  { label: 'Einladung', text: 'Einladung zur nächsten Mitgliederversammlung' },
  { label: 'Redaktionsplan', text: 'Redaktionsplan für Social Media im nächsten Monat' },
] as const;

const MAX_MATCHES = 5;

/**
 * Create-or-find sheet for the Arbeiten tab — the mobile counterpart of web's
 * `features/docs/DocsComposer`: one input that either generates a document from
 * what you typed or jumps to an existing document or template matching it.
 *
 * The template catalogue stays folded behind a single "Vorlagen" row. Listing all
 * nine of them up front made the sheet a wall of near-identical rows and buried
 * the two things people actually come here for — describe it, or find it.
 */
export function CreateDocSheet({
  visible,
  onClose,
  items,
  isCreating,
  onGenerate,
  onSelectTemplate,
  onOpenItem,
}: {
  visible: boolean;
  onClose: () => void;
  /** Everything already in the Arbeiten list, searched by title. */
  items: OfficeItem[];
  isCreating: boolean;
  onGenerate: (description: string) => void;
  onSelectTemplate: (template: DocumentTemplate) => void;
  onOpenItem: (item: OfficeItem) => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [query, setQuery] = useState('');
  const [templatesExpanded, setTemplatesExpanded] = useState(false);

  // A reopened sheet starts fresh — a stale query from last time would show
  // results for something the user has long since stopped looking for. The sheet
  // stays mounted behind the Modal, so every exit resets on its way out.
  const exit = (action?: () => void) => {
    setQuery('');
    setTemplatesExpanded(false);
    (action ?? onClose)();
  };

  const trimmed = query.trim();
  const lcQuery = trimmed.toLowerCase();

  const matchedItems = useMemo(
    () =>
      lcQuery
        ? items
            .filter((it) => (it.title || 'Unbenannt').toLowerCase().includes(lcQuery))
            .slice(0, MAX_MATCHES)
        : [],
    [items, lcQuery]
  );

  const matchedTemplates = useMemo(
    () =>
      lcQuery
        ? templates
            .filter(
              (t) =>
                t.name.toLowerCase().includes(lcQuery) ||
                t.description.toLowerCase().includes(lcQuery)
            )
            .slice(0, MAX_MATCHES)
        : [],
    [lcQuery]
  );

  const row = (
    key: string,
    icon: IoniconsIconName,
    title: string,
    subtitle: string,
    onPress: () => void
  ) => (
    <TouchableOpacity
      key={key}
      style={[styles.row, { borderBottomColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[styles.iconTile, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      >
        <Ionicons name={icon} size={20} color={colors.secondary[600]} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <BottomSheet visible={visible} onClose={() => exit()} keyboardAvoiding>
      <Text style={[styles.title, { color: theme.text }]}>Erstellen oder finden</Text>

      <View style={styles.inputRow}>
        <View style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.inputField, { color: theme.text }]}
            placeholder="Beschreiben oder suchen…"
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => trimmed && exit(() => onGenerate(trimmed))}
            returnKeyType="go"
            editable={!isCreating}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Eingabe löschen">
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <Pressable
          onPress={() => trimmed && exit(() => onGenerate(trimmed))}
          disabled={!trimmed || isCreating}
          accessibilityLabel="Mit KI erstellen"
          style={[styles.send, { opacity: trimmed && !isCreating ? 1 : 0.4 }]}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          )}
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" style={styles.results}>
        {trimmed ? (
          <>
            {row(
              'generate',
              'sparkles-outline',
              `„${trimmed}“ mit KI erstellen`,
              'Aus der Beschreibung generieren',
              () => exit(() => onGenerate(trimmed))
            )}
            {matchedItems.map((item) =>
              row(
                `item-${item.id}`,
                officeIconFor(item.kind),
                item.title || 'Unbenannt',
                'Öffnen',
                () => exit(() => onOpenItem(item))
              )
            )}
            {matchedTemplates.map((template) =>
              row(
                `tpl-${template.id}`,
                TEMPLATE_ICONS[template.id] ?? 'document-outline',
                template.name,
                `Vorlage · ${template.description}`,
                () => exit(() => onSelectTemplate(template))
              )
            )}
          </>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              keyboardShouldPersistTaps="handled"
            >
              {EXAMPLE_PROMPTS.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => setQuery(p.text)}
                  style={[
                    styles.chip,
                    { borderColor: theme.border, backgroundColor: theme.surface },
                  ]}
                >
                  <Text style={[styles.chipText, { color: theme.text }]}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => setTemplatesExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.iconTile,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder },
                ]}
              >
                <Ionicons name="albums-outline" size={20} color={colors.secondary[600]} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>Vorlagen</Text>
                <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>
                  {templates.length} Startpunkte, vom leeren Dokument bis zur Tabelle
                </Text>
              </View>
              <Ionicons
                name={templatesExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.textSecondary}
              />
            </TouchableOpacity>

            {templatesExpanded &&
              templates.map((template) =>
                row(
                  `tpl-${template.id}`,
                  TEMPLATE_ICONS[template.id] ?? 'document-outline',
                  template.name,
                  template.description,
                  () => exit(() => onSelectTemplate(template))
                )
              )}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingBottom: spacing.small,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: 20,
    paddingBottom: spacing.small,
  },
  input: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  inputField: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[600],
  },
  results: {
    paddingHorizontal: 20,
    // The sheet sizes to its content, so without a ceiling a long result list
    // would push past the BottomSheet's own maxHeight instead of scrolling.
    maxHeight: 360,
  },
  chips: {
    gap: spacing.xsmall,
    paddingBottom: spacing.small,
  },
  chip: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
});
