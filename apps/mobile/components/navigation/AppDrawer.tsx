import { AssistantRuntimeProvider } from '@assistant-ui/react-native';
import { type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';

import { useChatDrawerRuntime } from '../../hooks/useChatDrawerRuntime';
import { useDrawerStore } from '../../hooks/useDrawerStore';
import { lightTheme, darkTheme } from '../../theme';
import { ThreadListDrawer } from '../chat/ThreadListDrawer';
import { ThreadSync } from '../chat/ThreadSync';

export function AppDrawer({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const runtime = useChatDrawerRuntime();
  const open = useDrawerStore((s) => s.open);
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const closeDrawer = useDrawerStore((s) => s.closeDrawer);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadSync />
      <Drawer
        open={open}
        onOpen={openDrawer}
        onClose={closeDrawer}
        drawerType="slide"
        drawerStyle={{ width: '80%', backgroundColor: theme.background }}
        renderDrawerContent={() => <ThreadListDrawer theme={theme} />}
      >
        {children}
      </Drawer>
    </AssistantRuntimeProvider>
  );
}
