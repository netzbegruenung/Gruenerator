import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { Pressable } from 'react-native';

interface Props {
  color: string;
  size?: number;
}

export function SidebarMenuButton({ color, size = 26 }: Props) {
  const navigation = useNavigation();

  return (
    <Pressable
      onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
      hitSlop={8}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="menu" size={size} color={color} />
    </Pressable>
  );
}
