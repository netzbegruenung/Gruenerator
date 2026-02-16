/**
 * AdvancedSection Component
 * Renders advanced offset controls for dreizeilen template type
 * Collapsible section with BalkenOffset, BalkenGruppe, and Sonnenblumen controls
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';
import {
  BalkenOffsetControl,
  BalkenGruppeControl,
  SonnenblumenControl,
  CreditInput,
} from '../../image-modification';

interface AdvancedSectionProps {
  showCredit?: boolean;
  disabled?: boolean;
}

export function AdvancedSection({ showCredit = true, disabled = false }: AdvancedSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.header, { borderColor: theme.border }]}
        onPress={toggleExpanded}
        disabled={disabled}
      >
        <View style={styles.headerContent}>
          <Ionicons name="settings-outline" size={18} color={theme.text} />
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Erweitert</Text>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.textSecondary}
        />
      </Pressable>

      {isExpanded && (
        <View style={styles.content}>
          <BalkenOffsetControl disabled={disabled} />

          <View style={styles.divider} />

          <BalkenGruppeControl disabled={disabled} />

          <View style={styles.divider} />

          <SonnenblumenControl disabled={disabled} />

          {showCredit && (
            <>
              <View style={styles.divider} />
              <CreditInput disabled={disabled} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    gap: spacing.large,
    paddingTop: spacing.small,
  },
  divider: {
    height: 1,
    backgroundColor: colors.grey[200],
    marginVertical: spacing.xsmall,
  },
});
