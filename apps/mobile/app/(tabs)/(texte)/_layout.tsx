import { useColorScheme } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme, darkTheme, colors } from '../../../theme';

const { Navigator } = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext(Navigator);

export default function TexteLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
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
          tabBarScrollEnabled: true,
          tabBarItemStyle: {
            width: 'auto',
            paddingHorizontal: 12,
          },
          swipeEnabled: true,
          lazy: true,
        }}
      >
        <MaterialTopTabs.Screen
          name="presse"
          options={{ title: 'Presse & Social' }}
        />
        <MaterialTopTabs.Screen
          name="antrag"
          options={{ title: 'Anträge' }}
        />
        <MaterialTopTabs.Screen
          name="universal"
          options={{ title: 'Universal' }}
        />
      </MaterialTopTabs>
    </SafeAreaView>
  );
}
