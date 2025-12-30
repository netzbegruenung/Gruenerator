import { View, useColorScheme } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext, usePathname, useRouter, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme, darkTheme } from '../../../theme';
import { FloatingBadgeTabs, TabDefinition } from '../../../components/navigation';
import { useImageStudioStore, selectShouldShowBadges } from '../../../stores/imageStudioStore';

const { Navigator } = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext(Navigator);

const MEDIA_TABS: TabDefinition[] = [
  { key: 'reel', label: 'Reel' },
  { key: 'image-studio', label: 'Image Studio' },
];

export default function MediaLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const pathname = usePathname();
  const router = useRouter();

  const shouldShowBadges = useImageStudioStore(selectShouldShowBadges);

  const activeTab = pathname.includes('image-studio') ? 'image-studio' : 'reel';

  const handleTabPress = (tabKey: string) => {
    router.navigate(`/(tabs)/(media)/${tabKey}` as Href);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={{ flex: 1 }}>
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
        </MaterialTopTabs>

        {shouldShowBadges && (
          <FloatingBadgeTabs
            tabs={MEDIA_TABS}
            activeTab={activeTab}
            onTabPress={handleTabPress}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
