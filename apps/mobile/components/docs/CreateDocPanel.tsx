import { templates, type DocumentTemplate } from '@gruenerator/docs/templates';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import {
  borderRadius,
  colors,
  darkTheme,
  lightTheme,
  spacing,
  BODY_FONT,
  HEADING_FONT_SEMIBOLD,
} from '../../theme';

const TEMPLATE_ICONS: Record<string, IoniconsIconName> = {
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
  { icon: 'newspaper-outline', text: 'Pressemitteilung zum Klimaschutz in unserer Kommune' },
  {
    icon: 'clipboard-outline',
    text: 'Antrag für den Kreisparteitag zum Thema nachhaltige Mobilität',
  },
  { icon: 'create-outline', text: 'Protokoll der letzten Vorstandssitzung' },
  { icon: 'mail-outline', text: 'Einladung zur nächsten Mitgliederversammlung' },
  { icon: 'calendar-outline', text: 'Redaktionsplan für Social Media im nächsten Monat' },
] as const satisfies readonly { icon: IoniconsIconName; text: string }[];

export type CreateDocStep = 'start' | 'ki';

/**
 * The "Neues Dokument" page of the create menu: a blank document or the AI
 * writer as two large tiles, then every template as a tile. The keyboard only
 * comes up on the AI step, where there is something to type — opening on an
 * input left a field, four chips and a folded row above it.
 */
export function CreateDocPanel({
  step,
  onStep,
  onBack,
  isCreating,
  onGenerate,
  onSelectTemplate,
}: {
  step: CreateDocStep;
  onStep: (step: CreateDocStep) => void;
  /** Back to the create menu. */
  onBack: () => void;
  isCreating: boolean;
  onGenerate: (description: string) => void;
  onSelectTemplate: (template: DocumentTemplate) => void;
}) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const [description, setDescription] = useState('');
  const trimmed = description.trim();
  const blank = templates.find((t) => t.id === 'blank');

  const header = (title: string, back: () => void) => (
    <View style={styles.header}>
      <Pressable
        onPress={back}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Zurück"
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={24} color={colors.primary[600]} />
      </Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {title}
      </Text>
    </View>
  );

  if (step === 'ki') {
    return (
      <View style={styles.page}>
        {header('Mit KI schreiben', () => onStep('start'))}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <TextInput
            style={[
              styles.textarea,
              {
                color: theme.text,
                borderColor: colors.primary[600],
                backgroundColor: theme.surface,
              },
            ]}
            accessibilityLabel="Was soll im Dokument stehen?"
            placeholder="Was soll im Dokument stehen? Z. B. Antrag für mehr Radwege in unserer Gemeinde …"
            placeholderTextColor={theme.textSecondary}
            value={description}
            onChangeText={setDescription}
            editable={!isCreating}
            multiline
            autoFocus
            textAlignVertical="top"
          />
          <Pressable
            onPress={() => onGenerate(trimmed)}
            disabled={!trimmed || isCreating}
            accessibilityRole="button"
            accessibilityState={{ disabled: !trimmed || isCreating, busy: isCreating }}
            style={[styles.go, { opacity: trimmed && !isCreating ? 1 : 0.4 }]}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.goText}>Entwurf erstellen</Text>
            )}
          </Pressable>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Oder so beginnen</Text>
          {EXAMPLE_PROMPTS.map((p) => (
            <Pressable
              key={p.text}
              onPress={() => setDescription(p.text)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.suggestion,
                { borderColor: theme.border, backgroundColor: pressed ? theme.surface : undefined },
              ]}
            >
              <Ionicons name={p.icon} size={18} color={colors.secondary[600]} />
              <Text style={[styles.suggestionText, { color: theme.text }]}>{p.text}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {header('Neues Dokument', onBack)}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.bigRow}>
          <Pressable
            onPress={() => blank && onSelectTemplate(blank)}
            disabled={!blank || isCreating}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.big,
              { backgroundColor: theme.surface, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="document-outline" size={26} color={theme.text} />
            <View>
              <Text style={[styles.bigTitle, { color: theme.text }]}>Leeres Dokument</Text>
              <Text style={[styles.bigDesc, { color: theme.textSecondary }]}>
                Sofort losschreiben
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => onStep('ki')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.big,
              { backgroundColor: colors.secondary[600], opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="sparkles" size={26} color={colors.white} />
            <View>
              <Text style={[styles.bigTitle, { color: colors.white }]}>Mit KI schreiben</Text>
              <Text style={[styles.bigDesc, { color: colors.white, opacity: 0.85 }]}>
                KI schreibt den ersten Entwurf
              </Text>
            </View>
          </Pressable>
        </View>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Vorlagen</Text>
        <View style={styles.grid}>
          {pairs(templates.filter((t) => t.id !== 'blank')).map((row) => (
            <View key={row[0].id} style={styles.gridRow}>
              {row.map((template) => (
                <Pressable
                  key={template.id}
                  onPress={() => onSelectTemplate(template)}
                  disabled={isCreating}
                  accessibilityRole="button"
                  accessibilityHint={template.description}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      borderColor: theme.border,
                      backgroundColor: pressed ? theme.surface : undefined,
                    },
                  ]}
                >
                  <Ionicons
                    name={TEMPLATE_ICONS[template.id] ?? 'document-outline'}
                    size={22}
                    color={colors.secondary[600]}
                  />
                  <Text style={[styles.tileTitle, { color: theme.text }]} numberOfLines={1}>
                    {template.name}
                  </Text>
                  <Text style={[styles.tileDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                    {template.description}
                  </Text>
                </Pressable>
              ))}
              {/* An odd last row keeps its tile at column width. */}
              {row.length === 1 ? <View style={styles.tileSpacer} /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Two tiles a row — a percentage width plus the gap overflowed and wrapped every tile alone. */
function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

const styles = StyleSheet.create({
  page: { flexShrink: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingBottom: spacing.small,
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  title: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 18 },
  body: { gap: spacing.small, paddingBottom: spacing.medium },
  bigRow: { flexDirection: 'row', gap: spacing.small },
  big: {
    flex: 1,
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.xlarge,
  },
  bigTitle: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 16 },
  // Room for two lines in both tiles, so their titles line up whether or not
  // a description wraps.
  bigDesc: { fontFamily: BODY_FONT, fontSize: 13, lineHeight: 17, minHeight: 34, marginTop: 2 },
  label: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.small,
  },
  grid: { gap: spacing.small },
  gridRow: { flexDirection: 'row', gap: spacing.small },
  tileSpacer: { flex: 1 },
  tile: {
    flex: 1,
    minHeight: 100,
    gap: spacing.xxsmall,
    padding: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  tileTitle: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 15, marginTop: spacing.xxsmall },
  tileDesc: { fontFamily: BODY_FONT, fontSize: 12, lineHeight: 16 },
  textarea: {
    minHeight: 120,
    borderWidth: 1.5,
    borderRadius: borderRadius.large,
    padding: spacing.small,
    fontFamily: BODY_FONT,
    fontSize: 16,
  },
  go: {
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  goText: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 16, color: colors.white },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  suggestionText: { flex: 1, fontFamily: BODY_FONT, fontSize: 14 },
});
