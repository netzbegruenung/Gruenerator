import { useColorScheme } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { withLayoutContext } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lightTheme, darkTheme, colors } from '../../../theme';

const { Navigator } = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext(Navigator);

export default function ToolsLayout() {
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
          tabBarScrollEnabled: false,
          tabBarItemStyle: {
            flex: 1,
          },
          swipeEnabled: true,
          lazy: true,
        }}
      >
        <MaterialTopTabs.Screen name="suche" options={{ title: 'Suche' }} />
        <MaterialTopTabs.Screen name="barrierefreiheit" options={{ title: 'Barrierefreiheit' }} />
        <MaterialTopTabs.Screen name="texteditor" options={{ title: 'Text Editor' }} />
      </MaterialTopTabs>
    </SafeAreaView>
  );
}
