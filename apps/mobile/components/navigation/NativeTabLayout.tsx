import { Ionicons } from '@expo/vector-icons';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { colors } from '../../theme';

export function NativeTabLayout() {
  return (
    <NativeTabs
      minimizeBehavior={Platform.OS === 'ios' ? 'onScrollDown' : undefined}
      tintColor={colors.primary[600]}
    >
      <NativeTabs.Trigger name="index" hidden />
      <NativeTabs.Trigger name="start">
        {Platform.select({
          ios: <Icon sf={{ default: 'house', selected: 'house.fill' }} />,
          android: <Icon src={<VectorIcon family={Ionicons} name="home" />} />,
        })}
        <Label>Start</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(texte)">
        {Platform.select({
          ios: <Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} />,
          android: <Icon src={<VectorIcon family={Ionicons} name="document-text" />} />,
        })}
        <Label>Texte</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(media)">
        {Platform.select({
          ios: <Icon sf={{ default: 'video', selected: 'video.fill' }} />,
          android: <Icon src={<VectorIcon family={Ionicons} name="videocam" />} />,
        })}
        <Label>Medien</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(tools)">
        {Platform.select({
          ios: (
            <Icon
              sf={{ default: 'wrench.and.screwdriver', selected: 'wrench.and.screwdriver.fill' }}
            />
          ),
          android: <Icon src={<VectorIcon family={Ionicons} name="construct" />} />,
        })}
        <Label>Tools</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(notebooks)" hidden />
      <NativeTabs.Trigger name="(chat)">
        {Platform.select({
          ios: (
            <Icon
              sf={{
                default: 'bubble.left.and.text.bubble.right',
                selected: 'bubble.left.and.text.bubble.right.fill',
              }}
            />
          ),
          android: <Icon src={<VectorIcon family={Ionicons} name="chatbubble-ellipses" />} />,
        })}
        <Label>Chat</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" hidden />
    </NativeTabs>
  );
}
