import { Platform } from 'react-native';

import { AppDrawer, ClassicTabLayout, NativeTabLayout } from '../../components/navigation';

export default function TabLayout() {
  return (
    <AppDrawer>{Platform.OS === 'ios' ? <NativeTabLayout /> : <ClassicTabLayout />}</AppDrawer>
  );
}
