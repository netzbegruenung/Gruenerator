import { type TranslationQuota } from '@gruenerator/contracts';
import { StyleSheet, Text } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { typography } from '../../theme';

const NF = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** Like web's chip: only once fewer than this many Bäume are left is the balance worth a line. */
const SHOW_BELOW = 5;

/**
 * The tree budget as one sentence, shown only while it is running low. `null`
 * while the budget has not arrived yet.
 */
export function BudgetNote({ quota, hint }: { quota: TranslationQuota | null; hint?: string }) {
  const theme = useTheme();
  if (quota === null || quota.limit === null) return null;
  const remaining = quota.remaining ?? Math.max(quota.limit - quota.used, 0);
  if (remaining >= SHOW_BELOW) return null;
  const trees = remaining === 1 ? '1 Baum' : `${NF.format(remaining)} Bäume`;
  return (
    <Text style={[styles.note, { color: theme.textSecondary }]}>
      Heute noch {trees} von {NF.format(quota.limit)}.{hint ? ` ${hint}` : ''}
    </Text>
  );
}

const styles = StyleSheet.create({ note: { ...typography.caption } });
