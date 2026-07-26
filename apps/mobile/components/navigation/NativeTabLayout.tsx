import { Ionicons } from '@react-native-vector-icons/ionicons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useTabTint } from './useTabTint';

export function NativeTabLayout() {
  const tint = useTabTint();
  return (
    <NativeTabs
      minimizeBehavior={Platform.OS === 'ios' ? 'onScrollDown' : undefined}
      tintColor={tint}
    >
      <NativeTabs.Trigger name="index" hidden />
      <NativeTabs.Trigger name="start">
        {Platform.select({
          ios: <NativeTabs.Trigger.Icon sf={{ default: 'message', selected: 'message.fill' }} />,
          android: (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="chatbubble" />}
            />
          ),
        })}
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(arbeiten)">
        {Platform.select({
          ios: (
            <NativeTabs.Trigger.Icon sf={{ default: 'briefcase', selected: 'briefcase.fill' }} />
          ),
          android: (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="briefcase" />}
            />
          ),
        })}
        <NativeTabs.Trigger.Label>Arbeiten</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {/* Wissen is a tool tile on the Arbeiten tab now, not a tab of its own. */}
      <NativeTabs.Trigger name="(recherche)" hidden />
      <NativeTabs.Trigger name="(chat)" hidden />
      <NativeTabs.Trigger name="(office)" hidden />
      <NativeTabs.Trigger name="(tools)" hidden />
      <NativeTabs.Trigger name="profile" hidden />
    </NativeTabs>
  );
}
