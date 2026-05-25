import { Ionicons } from '@react-native-vector-icons/ionicons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
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
          ios: <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />,
          android: (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="home" />}
            />
          ),
        })}
        <NativeTabs.Trigger.Label>Start</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(chat)" hidden />
      <NativeTabs.Trigger name="(docs)">
        {Platform.select({
          ios: <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} />,
          android: (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="document-text" />}
            />
          ),
        })}
        <NativeTabs.Trigger.Label>Docs</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(tools)">
        {Platform.select({
          ios: (
            <NativeTabs.Trigger.Icon
              sf={{ default: 'wrench.and.screwdriver', selected: 'wrench.and.screwdriver.fill' }}
            />
          ),
          android: (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="construct" />}
            />
          ),
        })}
        <NativeTabs.Trigger.Label>Tools</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(recherche)">
        {Platform.select({
          ios: <NativeTabs.Trigger.Icon sf={{ default: 'note.text', selected: 'note.text' }} />,
          android: (
            <NativeTabs.Trigger.Icon
              src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="journal-outline" />}
            />
          ),
        })}
        <NativeTabs.Trigger.Label>Notebooks</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" hidden />
    </NativeTabs>
  );
}
