import { Platform } from 'react-native';

import { ClassicTabLayout, NativeTabLayout } from '../../components/navigation';

// AppDrawer (thread-list) is mounted once at the root layout so it wraps every
// screen, not just the tabs. Here we render only the tab navigator.
export default function TabLayout() {
  return Platform.OS === 'ios' ? <NativeTabLayout /> : <ClassicTabLayout />;
}
