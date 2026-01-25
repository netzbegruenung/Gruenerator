import { Platform } from 'react-native';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import { Ionicons } from '@expo/vector-icons';
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
      <NativeTabs.Trigger name="(notebooks)">
        {Platform.select({
          ios: <Icon sf={{ default: 'text.bubble', selected: 'text.bubble.fill' }} />,
          android: <Icon src={<VectorIcon family={Ionicons} name="chatbubbles" />} />,
        })}
        <Label>Fragen</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(docs)">
        {Platform.select({
          ios: <Icon sf={{ default: 'doc.on.doc', selected: 'doc.on.doc.fill' }} />,
          android: <Icon src={<VectorIcon family={Ionicons} name="documents" />} />,
        })}
        <Label>Docs</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" hidden />
    </NativeTabs>
  );
}
