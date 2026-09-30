import { Platform } from 'react-native';

import { ClassicTabLayout, NativeTabLayout } from '../../components/navigation';
import { WorkplaceTabLayout } from '../../components/navigation/WorkplaceTabLayout';
import { isWorkplaceLayout } from '../../config/navLayout';

// AppDrawer (thread-list) is mounted once at the root layout so it wraps every
// screen, not just the tabs. Here we render only the tab navigator.
export default function TabLayout() {
  if (isWorkplaceLayout) return <WorkplaceTabLayout />;
  return Platform.OS === 'ios' ? <NativeTabLayout /> : <ClassicTabLayout />;
}
