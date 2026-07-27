import { Pressable } from 'react-native';

import { useDrawerStore } from '../../hooks/useDrawerStore';
import { MenuAlt2Icon } from '../icons/WebMirrorIcons';

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
      accessibilityLabel="Menü öffnen"
      accessibilityRole="button"
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <MenuAlt2Icon size={size} color={color} />
    </Pressable>
  );
}
