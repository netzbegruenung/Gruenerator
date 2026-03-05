import { filterMentionables, type Mentionable } from '@gruenerator/chat';
import { memo } from 'react';
import { View, Text, Pressable, SectionList, StyleSheet } from 'react-native';

import { spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

interface MentionSuggestionsProps {
  mode: 'functions' | 'skills';
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

function buildSections(mode: 'functions' | 'skills', query: string): Section[] {
  const { agents, customAgents, notebooks, tools, documents } = filterMentionables(query);
  const sections: Section[] = [];

  if (mode === 'skills') {
    if (agents.length > 0) sections.push({ title: 'Assistenten', data: agents });
    if (customAgents.length > 0) sections.push({ title: 'Meine Agenten', data: customAgents });
  } else {
    if (tools.length > 0) sections.push({ title: 'Werkzeuge', data: tools });
    if (documents.length > 0) sections.push({ title: 'Dateien', data: documents });
    if (notebooks.length > 0) sections.push({ title: 'Notizbücher', data: notebooks });
  }

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
  mode,
  query,
  visible,
  theme,
  onSelect,
}: MentionSuggestionsProps) {
  const sections = buildSections(mode, query);

  if (!visible || sections.length === 0) return null;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background, borderColor: theme.border }]}
    >
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.identifier}
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
    fontSize: 10,
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
    fontSize: 14,
  },
  textCol: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
  },
});
