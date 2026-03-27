import { AssistantRuntimeProvider } from '@assistant-ui/react-native';
import { Drawer } from 'expo-router/drawer';
import { useColorScheme } from 'react-native';

import { ThreadListDrawer } from '../../../components/chat/ThreadListDrawer';
import { ThreadSync } from '../../../components/chat/ThreadSync';
import { useChatDrawerRuntime } from '../../../hooks/useChatDrawerRuntime';
import { lightTheme, darkTheme } from '../../../theme';

export default function ChatLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const runtime = useChatDrawerRuntime();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadSync />
      <Drawer
        drawerContent={(props) => <ThreadListDrawer {...props} theme={theme} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'slide',
          swipeEnabled: true,
          drawerStyle: { width: '80%', backgroundColor: theme.background },
        }}
      >
        <Drawer.Screen name="index" options={{ title: 'Chat' }} />
      </Drawer>
    </AssistantRuntimeProvider>
  );
}
