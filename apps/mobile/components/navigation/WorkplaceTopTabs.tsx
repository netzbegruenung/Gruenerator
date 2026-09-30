import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { type TabRoute } from '../../hooks/tabOrder';
import { colors } from '../../theme';
import { route } from '../../types/routes';

export type WorkplaceTab = 'chat' | 'arbeiten';

/**
 * Must match `TAB_ORDER` in the workplace shell, so a swipe lands on the pill
 * next to the active one.
 */
const TABS: readonly { id: WorkplaceTab; label: string; path: TabRoute }[] = [
  { id: 'chat', label: 'Chat', path: '/start' },
  { id: 'arbeiten', label: 'Arbeiten', path: '/(tabs)/(arbeiten)' },
];

/**
 * The two pills top centre — the mobile port of web's `WorkplaceTabs` on
 * `GlassTabBar`: one frosted capsule, the active pill tinted per tab (Chat
 * neutral, Arbeiten soft green). Colours are web's `PILL_TINT`/`ACTIVE_TEXT`.
 *
 * `navigate`, not `push`: the two tabs are siblings, and pushing would stack a
 * history the back gesture then has to unwind.
 */
export function WorkplaceTopTabs({ active }: { active: WorkplaceTab }) {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const tint: Record<WorkplaceTab, { bg: string; text: string }> = isDark
    ? {
        chat: { bg: colors.grey[800], text: colors.grey[100] },
        arbeiten: { bg: '#16301F', text: colors.primary[300] },
      }
    : {
        chat: { bg: colors.white, text: colors.grey[900] },
        arbeiten: { bg: '#E9F4EC', text: colors.primary[700] },
      };

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.capsule,
        isDark
          ? { backgroundColor: 'rgba(23, 23, 23, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }
          : {
              backgroundColor: 'rgba(246, 246, 244, 0.6)',
              borderColor: 'rgba(255, 255, 255, 0.5)',
            },
      ]}
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => !selected && router.navigate(route(tab.path))}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={4}
            style={[styles.pill, selected && { backgroundColor: tint[tab.id].bg }]}
          >
            <Text
              style={[
                styles.label,
                selected
                  ? [styles.labelActive, { color: tint[tab.id].text }]
                  : { color: isDark ? colors.grey[400] : colors.grey[600] },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 3,
    gap: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 999,
  },
  label: {
    fontFamily: 'Raleway_500Medium',
    fontSize: 15,
  },
  labelActive: {
    fontFamily: 'Raleway_700Bold',
  },
});
