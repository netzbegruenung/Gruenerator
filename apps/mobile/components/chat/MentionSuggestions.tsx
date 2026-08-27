import {
  filterMentionables,
  mentionableKey,
  splitRecipesByOrigin,
  RECIPE_ORIGIN_SECTION_TITLES,
  type Mentionable,
} from '@gruenerator/chat';
import { memo } from 'react';
import { View, Text, Pressable, SectionList, StyleSheet } from 'react-native';

import { spacing, borderRadius, BODY_FONT, chatType } from '../../theme';

import type { Theme } from '../../theme/colors';

interface MentionSuggestionsProps {
  query: string;
  visible: boolean;
  theme: Theme;
  onSelect: (mentionable: Mentionable) => void;
  onDismiss: () => void;
}

interface Section {
  title: string;
  data: Mentionable[];
}

/**
 * One list behind '@' — recipes no longer have their own trigger.
 *
 * The recipe split comes from `splitRecipesByOrigin` rather than a local
 * `sharedFromGroup` filter: a second copy of the rule here is exactly the seam
 * #2876 warned about, and it drifts the moment a new origin is added on the
 * shared side. Only the section wording stays mobile's own — the titles are one
 * heading level, so they carry the word "Rezepte" themselves.
 */
function buildSections(query: string): Section[] {
  const { agents, customAgents, notebooks, tools, documents } = filterMentionables(query);
  const sections: Section[] = splitRecipesByOrigin(agents, customAgents).map(
    ({ origin, items }) => ({ title: RECIPE_ORIGIN_SECTION_TITLES[origin], data: items })
  );

  if (tools.length > 0) sections.push({ title: 'Werkzeuge', data: tools });
  if (documents.length > 0) sections.push({ title: 'Dateien', data: documents });
  if (notebooks.length > 0) sections.push({ title: 'Notizbücher', data: notebooks });

  return sections;
}

const MentionRow = memo(function MentionRow({
  item,
  theme,
  onSelect,
}: {
  item: Mentionable;
  theme: Theme;
  onSelect: (m: Mentionable) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.surface : 'transparent' },
      ]}
      onPress={() => onSelect(item)}
      accessibilityRole="button"
    >
      <View style={[styles.avatar, { backgroundColor: item.backgroundColor }]}>
        <Text style={styles.avatarEmoji}>{item.avatar}</Text>
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
          {item.trigger}
          {item.mention}
        </Text>
      </View>
    </Pressable>
  );
});

export const MentionSuggestions = memo(function MentionSuggestions({
  query,
  visible,
  theme,
  onSelect,
}: MentionSuggestionsProps) {
  const sections = buildSections(query);

  if (!visible || sections.length === 0) return null;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background, borderColor: theme.border }]}
    >
      <SectionList
        sections={sections}
        keyExtractor={mentionableKey}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => <MentionRow item={item} theme={theme} onSelect={onSelect} />}
        style={styles.list}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    maxHeight: 240,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.large,
    marginHorizontal: spacing.xsmall,
    marginBottom: spacing.xsmall,
    overflow: 'hidden',
  },
  list: {
    flexGrow: 0,
  },
  sectionHeader: {
    ...chatType.chatMicro,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
    paddingBottom: spacing.xxsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    gap: spacing.small,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    ...chatType.chatSecondary,
  },
  textCol: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...chatType.chatSecondary,
    fontWeight: '600',
  },
  subtitle: {
    ...chatType.chatMeta,
  },
});
