import { type TranslationLanguage } from '@gruenerator/contracts';
import { AUTO, AUTO_LABEL, languageName } from '@gruenerator/shared/translation';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

/** Stands in for "Automatisch erkennen" wherever auto is off. */
const AUTO_OFF_LABEL = 'Bitte wählen';

interface LanguageBarProps {
  /** "Von" or "Nach" — names the picker and its sheet. */
  label: string;
  value: string;
  onChange: (code: string) => void;
  options: readonly TranslationLanguage[];
  /** The quick-pick chips, most recent first. */
  recent: readonly string[];
  /** The language list is still on its way: placeholder chips instead. */
  loading?: boolean;
  /** Offer "Automatisch erkennen" first (source side only). */
  withAuto?: boolean;
  /** A glossary translates into the chosen target — auto would silently drop it. */
  autoDisabled?: boolean;
  onSwap?: () => void;
  swapDisabled?: boolean;
  /** Sits at the right end of the bar, e.g. the formality picker. */
  children?: ReactNode;
}

/**
 * The web translator's language bar, native: the last few languages as chips
 * one tap away, the full DeepL list in a searchable sheet behind the chevron.
 */
export function LanguageBar({
  label,
  value,
  onChange,
  options,
  recent,
  loading = false,
  withAuto = false,
  autoDisabled = false,
  onSwap,
  swapDisabled,
  children,
}: LanguageBarProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const empty = options.length === 0;
  const nameOf = (code: string) =>
    code === AUTO ? (autoDisabled ? AUTO_OFF_LABEL : AUTO_LABEL) : languageName(options, code);

  const q = query.trim().toLowerCase();
  const all = [
    ...(withAuto ? [{ code: AUTO, name: AUTO_LABEL }] : []),
    ...options.map((l) => ({ code: l.code, name: l.name })),
  ].filter((l) => !q || l.name.toLowerCase().includes(q));

  const pick = (code: string) => {
    setOpen(false);
    setQuery('');
    onChange(code);
  };

  return (
    <View style={[styles.bar, { borderBottomColor: theme.border }]}>
      {loading ? (
        <View accessible accessibilityLabel={`${label}: Lade Sprachen`} style={styles.loading}>
          {/* `card` in both tabs: the bar sits on a card under Text and on the
              plain screen under Dokument, and only this shade shows on both. */}
          <SkeletonGroup on="card" style={styles.loadingChips}>
            <SkeletonBar width={72} height={14} />
            <SkeletonBar width={56} height={14} />
            <SkeletonBar width={64} height={14} />
          </SkeletonGroup>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityLabel={`Schnellwahl ${label}`}
        >
          {recent.map((code) => {
            const active = code === value;
            const blocked = code === AUTO && autoDisabled;
            return (
              <Pressable
                key={code}
                onPress={() => onChange(code)}
                disabled={blocked}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: blocked }}
                style={[styles.chip, active && { borderBottomColor: colors.primary[600] }]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: blocked
                        ? theme.textSecondary
                        : active
                          ? colors.primary[600]
                          : theme.text,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {nameOf(code)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={empty}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${nameOf(value)} – alle Sprachen`}
        accessibilityState={{ disabled: empty }}
        style={[styles.iconButton, empty && styles.off]}
      >
        <Ionicons name="chevron-down" size={20} color={theme.text} />
      </Pressable>
      {children}
      {onSwap ? (
        <Pressable
          onPress={onSwap}
          disabled={swapDisabled}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Sprachen tauschen"
          accessibilityState={{ disabled: !!swapDisabled }}
          style={[styles.iconButton, swapDisabled && styles.off]}
        >
          <Ionicons name="swap-horizontal" size={20} color={theme.text} />
        </Pressable>
      ) : null}

      <BottomSheet
        visible={open}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        padded
        keyboardAvoiding
      >
        <Text accessibilityRole="header" style={[styles.sheetTitle, { color: theme.text }]}>
          {label}
        </Text>
        <View
          style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Sprache suchen"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Sprache suchen"
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        <FlatList
          data={all}
          keyExtractor={(l) => l.code}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          renderItem={({ item }) => {
            const blocked = item.code === AUTO && autoDisabled;
            const active = item.code === value;
            return (
              <Pressable
                onPress={() => pick(item.code)}
                disabled={blocked}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: blocked }}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? theme.surface : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.rowText,
                    { color: blocked ? theme.textSecondary : theme.text },
                    active && styles.rowActive,
                  ]}
                >
                  {item.code === AUTO && autoDisabled ? AUTO_OFF_LABEL : item.name}
                </Text>
                {active ? (
                  <Ionicons name="checkmark" size={20} color={colors.primary[600]} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xxsmall,
  },
  chips: { alignItems: 'center' },
  loading: { flex: 1, height: 44, justifyContent: 'center' },
  loadingChips: { flexDirection: 'row', gap: spacing.large, paddingHorizontal: spacing.small },
  chip: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.small,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  chipText: { ...typography.bodySmall, fontWeight: '600' },
  iconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  sheetTitle: { ...typography.bodyBold, paddingBottom: spacing.small },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.small,
    marginBottom: spacing.xsmall,
  },
  searchInput: { flex: 1, ...typography.body, paddingVertical: 0 },
  list: { maxHeight: 420 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  rowText: { ...typography.body },
  rowActive: { fontWeight: '700' },
});
