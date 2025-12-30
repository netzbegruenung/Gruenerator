import { View, StyleSheet } from 'react-native';
import {
  Bubble,
  InputToolbar,
  Composer,
  Send,
  BubbleProps,
  InputToolbarProps,
  ComposerProps,
  SendProps,
} from 'react-native-gifted-chat';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

type Theme = typeof lightTheme | typeof darkTheme;

export function createChatRenderers(theme: Theme) {
  const renderBubble = (props: BubbleProps) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: {
          backgroundColor: colors.primary[600],
          borderRadius: borderRadius.large,
          marginVertical: spacing.xxsmall,
        },
        left: {
          backgroundColor: theme.surface,
          borderRadius: borderRadius.large,
          marginVertical: spacing.xxsmall,
        },
      }}
      textStyle={{
        right: {
          color: colors.white,
        },
        left: {
          color: theme.text,
        },
      }}
    />
  );

  const renderInputToolbar = (props: InputToolbarProps) => (
    <InputToolbar
      {...props}
      containerStyle={[
        styles.inputToolbar,
        {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
        },
      ]}
      primaryStyle={[
        styles.inputPillContainer,
        {
          backgroundColor: theme.surface,
        },
      ]}
    />
  );

  const renderComposer = (props: ComposerProps) => (
    <Composer
      {...props}
      textInputStyle={[
        styles.composer,
        {
          color: theme.text,
          backgroundColor: 'transparent',
        },
      ]}
      placeholderTextColor={theme.textSecondary}
    />
  );

  const renderSend = (props: SendProps) => (
    <Send {...props} containerStyle={styles.sendContainer}>
      <View style={[styles.sendButton, { backgroundColor: colors.primary[600] }]}>
        <Ionicons name="send" size={18} color={colors.white} />
      </View>
    </Send>
  );

  return {
    renderBubble,
    renderInputToolbar,
    renderComposer,
    renderSend,
  };
}

export const styles = StyleSheet.create({
  inputToolbar: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    paddingBottom: spacing.medium,
  },
  inputPillContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: borderRadius.pill,
    paddingLeft: spacing.medium,
    paddingRight: spacing.xsmall,
    paddingVertical: spacing.xsmall,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  composer: {
    paddingHorizontal: 0,
    paddingVertical: spacing.small,
    fontSize: 16,
    marginRight: spacing.xsmall,
    lineHeight: 20,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xxsmall,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
