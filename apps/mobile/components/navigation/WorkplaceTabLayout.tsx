import { Tabs } from 'expo-router';

/**
 * The workplace shell (`config/navLayout`): the same routes as the four-tab
 * layouts, without a bar. Switching happens through the pills in
 * `WorkplaceTopTabs` and the swipe from `useTabNavigationSwipe`.
 *
 * Every group stays registered so deep links and pushes into Studio, Wissen or
 * the tools keep resolving. `backBehavior="history"` because Wissen and the
 * Studio are reached from a tile on Arbeiten now, and their back arrow has to
 * lead there rather than to the first tab.
 *
 * JS `Tabs` on both platforms: iOS's native tabs cannot drop their bar.
 */
export function WorkplaceTabLayout() {
  return (
    <Tabs
      tabBar={() => null}
      backBehavior="history"
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="start" />
      <Tabs.Screen name="(arbeiten)" />
      <Tabs.Screen name="(studio)" />
      <Tabs.Screen name="(recherche)" />
      <Tabs.Screen name="(chat)" />
      <Tabs.Screen name="(tools)" />
    </Tabs>
  );
}
