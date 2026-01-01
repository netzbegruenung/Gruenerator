import { View, useColorScheme } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext, usePathname, useRouter, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme, darkTheme } from '../../../theme';
import { FloatingBadgeTabs, TabDefinition } from '../../../components/navigation';

const { Navigator } = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext(Navigator);

const BADGE_HEIGHT = 52;

const MEDIA_TABS: TabDefinition[] = [
  { key: 'reel', label: 'Reel' },
  { key: 'image-studio', label: 'Image Studio' },
  { key: 'mediathek', label: 'Mediathek' },
];

export default function MediaLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const pathname = usePathname();
  const router = useRouter();

  const activeTab = pathname.includes('image-studio')
    ? 'image-studio'
    : pathname.includes('mediathek')
      ? 'mediathek'
      : 'reel';

  const handleTabPress = (tabKey: string) => {
    router.navigate(`/(tabs)/(media)/${tabKey}` as Href);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <FloatingBadgeTabs
        tabs={MEDIA_TABS}
        activeTab={activeTab}
        onTabPress={handleTabPress}
      />
      <View style={{ flex: 1, paddingTop: BADGE_HEIGHT }}>
        <MaterialTopTabs
          tabBar={() => null}
          screenOptions={{
            swipeEnabled: true,
            lazy: true,
          }}
        >
          <MaterialTopTabs.Screen
            name="reel"
            options={{ title: 'Reel' }}
          />
          <MaterialTopTabs.Screen
            name="image-studio"
            options={{ title: 'Image Studio' }}
          />
          <MaterialTopTabs.Screen
            name="mediathek"
            options={{ title: 'Mediathek' }}
          />
        </MaterialTopTabs>
      </View>
    </SafeAreaView>
  );
}
