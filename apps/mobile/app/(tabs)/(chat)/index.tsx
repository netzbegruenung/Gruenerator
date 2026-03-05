import { useNavigation } from 'expo-router';
import { View, useColorScheme } from 'react-native';

import { AssistantThread } from '../../../components/chat/AssistantThread';
import { ChatDrawerHeader } from '../../../components/chat/ChatDrawerHeader';
import { lightTheme, darkTheme } from '../../../theme';

import type { DrawerNavigationProp } from '@react-navigation/drawer';

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const navigation = useNavigation<DrawerNavigationProp<Record<string, object>>>();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ChatDrawerHeader onOpenDrawer={() => navigation.openDrawer()} theme={theme} />
      <AssistantThread theme={theme} />
    </View>
  );
}
