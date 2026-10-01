import { AssistantRuntimeProvider } from '@assistant-ui/react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, View, useColorScheme, useWindowDimensions } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';

import { useChatDrawerRuntime } from '../../hooks/useChatDrawerRuntime';
import { useDrawerStore } from '../../hooks/useDrawerStore';
import { lightTheme, darkTheme } from '../../theme';
import { ThreadListDrawer } from '../chat/ThreadListDrawer';
import { ThreadSync } from '../chat/ThreadSync';

export function AppDrawer({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { width } = useWindowDimensions();
  // Cap the drawer so it stays readable on wide / Split View iPad panes
  // instead of spanning 80% of a large screen.
  const drawerWidth = Math.min(width * 0.8, 360);
  const runtime = useChatDrawerRuntime();
  const open = useDrawerStore((s) => s.open);
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const closeDrawer = useDrawerStore((s) => s.closeDrawer);

  // The thread list is closed almost all the time, so it waits for the first
  // idle moment after launch instead of rendering alongside the first screen.
  // Idle rather than on first open, so opening the drawer never has to build
  // the whole list during its own slide-in.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    const handle = requestIdleCallback(() => setContentReady(true));
    return () => cancelIdleCallback(handle);
  }, []);
  const showContent = contentReady || open;

  const drawerStyle = useMemo(
    () => ({ width: drawerWidth, backgroundColor: theme.background }),
    [drawerWidth, theme.background]
  );
  const renderDrawerContent = useCallback(
    () => (showContent ? <ThreadListDrawer theme={theme} /> : <View />),
    [showContent, theme]
  );

  // react-native-drawer-layout installs no back handler of its own (react-navigation's
  // drawer does). Without this, Android's back button navigated the stack *behind* an
  // open drawer instead of closing it — and if the overlay is ever unreachable, that
  // leaves no way out at all.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDrawer();
      return true;
    });
    return () => sub.remove();
  }, [open, closeDrawer]);

  // Swipe only ever CLOSES the drawer here. Opening is the screens' job (see
  // `useTabSwipe` in start.tsx), because this drawer's own pan handler claims
  // horizontal drags in both directions across the whole screen — with it on,
  // a screen-level swipe-left to change tab never fires.
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadSync />
      <Drawer
        open={open}
        onOpen={openDrawer}
        onClose={closeDrawer}
        swipeEnabled={open}
        swipeEdgeWidth={width}
        drawerType="slide"
        drawerStyle={drawerStyle}
        renderDrawerContent={renderDrawerContent}
      >
        {children}
      </Drawer>
    </AssistantRuntimeProvider>
  );
}
