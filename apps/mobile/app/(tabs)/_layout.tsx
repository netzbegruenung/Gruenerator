import { Platform } from 'react-native';
import { ClassicTabLayout, NativeTabLayout } from '../../components/navigation';

export default function TabLayout() {
  if (Platform.OS === 'ios') {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
