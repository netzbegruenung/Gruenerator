import { useColorScheme } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { lightTheme, darkTheme, colors } from '../../../theme';

const { Navigator } = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext(Navigator);

export default function MediaLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar style="auto" />
      <MaterialTopTabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary[600],
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarIndicatorStyle: {
            backgroundColor: colors.primary[600],
            height: 3,
          },
          tabBarStyle: {
            backgroundColor: theme.background,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            textTransform: 'none',
          },
          tabBarPressColor: colors.primary[100],
          tabBarScrollEnabled: false,
          tabBarItemStyle: {
            flex: 1,
          },
          swipeEnabled: true,
          lazy: true,
        }}
      >
        <MaterialTopTabs.Screen name="reel" options={{ title: 'Reel' }} />
        <MaterialTopTabs.Screen name="image-studio" options={{ title: 'Image Studio' }} />
        <MaterialTopTabs.Screen name="vorlagen" options={{ title: 'Vorlagen' }} />
      </MaterialTopTabs>
    </SafeAreaView>
  );
}
