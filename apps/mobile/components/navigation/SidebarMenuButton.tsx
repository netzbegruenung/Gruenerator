import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable } from 'react-native';

import { useDrawerStore } from '../../hooks/useDrawerStore';

interface Props {
  color: string;
  size?: number;
}

export function SidebarMenuButton({ color, size = 26 }: Props) {
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  return (
    <Pressable
      onPress={openDrawer}
      hitSlop={8}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="menu" size={size} color={color} />
    </Pressable>
  );
}
