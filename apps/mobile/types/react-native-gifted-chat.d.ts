/**
 * Custom type declarations for react-native-gifted-chat
 *
 * The library ships with source .tsx files that have type errors.
 * This declaration file overrides those to provide clean, properly typed interfaces.
 */
declare module 'react-native-gifted-chat' {
  import type { ComponentType, ReactNode } from 'react';
  import type { ViewStyle, TextStyle, ImageStyle, StyleProp, TextInputProps } from 'react-native';
  import type { FlatListProps } from 'react-native';

  // =============================================================================
  // Core Types
  // =============================================================================

  export interface User {
    _id: string | number;
    name?: string;
    avatar?: string | number | (() => ReactNode);
  }

  export interface IMessage {
    _id: string | number;
    text: string;
    createdAt: Date | number;
    user: User;
    image?: string;
    video?: string;
    audio?: string;
    system?: boolean;
    sent?: boolean;
    received?: boolean;
    pending?: boolean;
    quickReplies?: QuickReplies;
  }

  export interface QuickReplies {
    type: 'radio' | 'checkbox';
    values: Reply[];
    keepIt?: boolean;
  }

  export interface Reply {
    title: string;
    value: string;
    messageId?: string | number;
  }

  export interface LeftRightStyle<T> {
    left?: StyleProp<T>;
    right?: StyleProp<T>;
  }

  // =============================================================================
  // Context Types
  // =============================================================================

  export interface MessageContext {
    actionSheet: () => void;
  }

  // =============================================================================
  // Component Props Interfaces
  // =============================================================================

  export interface BubbleProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    nextMessage?: TMessage;
    previousMessage?: TMessage;
    user?: User;
    position?: 'left' | 'right';
    containerStyle?: LeftRightStyle<ViewStyle>;
    wrapperStyle?: LeftRightStyle<ViewStyle>;
    textStyle?: LeftRightStyle<TextStyle>;
    bottomContainerStyle?: LeftRightStyle<ViewStyle>;
    tickStyle?: StyleProp<TextStyle>;
    usernameStyle?: StyleProp<TextStyle>;
    containerToNextStyle?: LeftRightStyle<ViewStyle>;
    containerToPreviousStyle?: LeftRightStyle<ViewStyle>;
    renderMessageImage?: (props: MessageImageProps<TMessage>) => ReactNode;
    renderMessageVideo?: (props: MessageVideoProps<TMessage>) => ReactNode;
    renderMessageAudio?: (props: MessageAudioProps<TMessage>) => ReactNode;
    renderMessageText?: (props: MessageTextProps<TMessage>) => ReactNode;
    renderCustomView?: (props: CustomViewProps<TMessage>) => ReactNode;
    renderUsername?: (props: UsernameProps<TMessage>) => ReactNode;
    renderTime?: (props: TimeProps<TMessage>) => ReactNode;
    renderTicks?: (props: TicksProps<TMessage>) => ReactNode;
    renderQuickReplies?: (props: QuickRepliesProps<TMessage>) => ReactNode;
    onPress?: (context: MessageContext, message: TMessage) => void;
    onLongPress?: (context: MessageContext, message: TMessage) => void;
    touchableProps?: object;
  }

  export interface InputToolbarProps<TMessage extends IMessage = IMessage> {
    text?: string;
    composerHeight?: number;
    containerStyle?: StyleProp<ViewStyle>;
    primaryStyle?: StyleProp<ViewStyle>;
    accessoryStyle?: StyleProp<ViewStyle>;
    renderAccessory?: (props: InputToolbarProps<TMessage>) => ReactNode;
    renderActions?: (props: ActionsProps) => ReactNode;
    renderSend?: (props: SendProps<TMessage>) => ReactNode;
    renderComposer?: (props: ComposerProps) => ReactNode;
    onPressActionButton?: () => void;
    onSend?: (messages: Partial<TMessage>[], shouldResetInputToolbar: boolean) => void;
  }

  export interface ComposerProps {
    composerHeight?: number;
    text?: string;
    placeholder?: string;
    placeholderTextColor?: string;
    textInputProps?: Partial<TextInputProps>;
    textInputStyle?: StyleProp<TextStyle>;
    textInputAutoFocus?: boolean;
    keyboardAppearance?: 'default' | 'light' | 'dark';
    multiline?: boolean;
    disableComposer?: boolean;
    onTextChanged?: (text: string) => void;
    onInputSizeChanged?: (contentSize: { width: number; height: number }) => void;
  }

  export interface SendProps<TMessage extends IMessage = IMessage> {
    text?: string;
    onSend?: (messages: Partial<TMessage>[], shouldResetInputToolbar: boolean) => void;
    label?: string;
    containerStyle?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    children?: ReactNode;
    alwaysShowSend?: boolean;
    disabled?: boolean;
    sendButtonProps?: object;
  }

  export interface AvatarProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    previousMessage?: TMessage;
    nextMessage?: TMessage;
    position?: 'left' | 'right';
    renderAvatarOnTop?: boolean;
    showAvatarForEveryMessage?: boolean;
    imageStyle?: LeftRightStyle<ImageStyle>;
    containerStyle?: LeftRightStyle<ViewStyle>;
    onPressAvatar?: (user: User) => void;
    onLongPressAvatar?: (user: User) => void;
  }

  export interface MessageProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    nextMessage?: TMessage;
    previousMessage?: TMessage;
    user?: User;
    position?: 'left' | 'right';
    containerStyle?: LeftRightStyle<ViewStyle>;
    renderBubble?: (props: BubbleProps<TMessage>) => ReactNode;
    renderDay?: (props: DayProps<TMessage>) => ReactNode;
    renderSystemMessage?: (props: SystemMessageProps<TMessage>) => ReactNode;
    renderAvatar?: (props: AvatarProps<TMessage>) => ReactNode;
    shouldUpdateMessage?: (props: MessageProps<TMessage>, nextProps: MessageProps<TMessage>) => boolean;
    onMessageLayout?: (event: object) => void;
  }

  export interface MessageTextProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    position?: 'left' | 'right';
    textStyle?: LeftRightStyle<TextStyle>;
    linkStyle?: LeftRightStyle<TextStyle>;
    customTextStyle?: StyleProp<TextStyle>;
    parsePatterns?: (linkStyle: TextStyle) => object[];
  }

  export interface MessageImageProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    containerStyle?: StyleProp<ViewStyle>;
    imageStyle?: StyleProp<ImageStyle>;
    imageProps?: object;
    lightboxProps?: object;
  }

  export interface MessageVideoProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    containerStyle?: StyleProp<ViewStyle>;
    videoStyle?: StyleProp<ViewStyle>;
    videoProps?: object;
  }

  export interface MessageAudioProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    containerStyle?: StyleProp<ViewStyle>;
    audioStyle?: StyleProp<ViewStyle>;
    audioProps?: object;
  }

  export interface CustomViewProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    position?: 'left' | 'right';
    containerStyle?: LeftRightStyle<ViewStyle>;
  }

  export interface UsernameProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    textStyle?: StyleProp<TextStyle>;
  }

  export interface TimeProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    position?: 'left' | 'right';
    timeTextStyle?: LeftRightStyle<TextStyle>;
    timeFormat?: string;
  }

  export interface TicksProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
  }

  export interface QuickRepliesProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    quickReplies?: QuickReplies;
    onQuickReply?: (replies: Reply[]) => void;
    color?: string;
    sendText?: string;
    renderQuickReplySend?: () => ReactNode;
  }

  export interface DayProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    previousMessage?: TMessage;
    nextMessage?: TMessage;
    containerStyle?: StyleProp<ViewStyle>;
    wrapperStyle?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    dateFormat?: string;
  }

  export interface SystemMessageProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    containerStyle?: StyleProp<ViewStyle>;
    wrapperStyle?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
  }

  export interface ActionsProps {
    containerStyle?: StyleProp<ViewStyle>;
    wrapperStyle?: StyleProp<ViewStyle>;
    iconTextStyle?: StyleProp<TextStyle>;
    icon?: () => ReactNode;
    options?: Record<string, () => void>;
    optionTintColor?: string;
    onPressActionButton?: () => void;
  }

  // =============================================================================
  // Main GiftedChat Props
  // =============================================================================

  export interface GiftedChatProps<TMessage extends IMessage = IMessage> {
    messages?: TMessage[];
    text?: string;
    placeholder?: string;
    user?: User;
    onSend?: (messages: TMessage[]) => void;
    onInputTextChanged?: (text: string) => void;
    isTyping?: boolean;
    alwaysShowSend?: boolean;
    inverted?: boolean;
    renderBubble?: (props: BubbleProps<TMessage>) => ReactNode;
    renderInputToolbar?: (props: InputToolbarProps<TMessage>) => ReactNode;
    renderComposer?: (props: ComposerProps) => ReactNode;
    renderSend?: (props: SendProps<TMessage>) => ReactNode;
    renderAvatar?: (props: AvatarProps<TMessage>) => ReactNode;
    renderMessage?: (props: MessageProps<TMessage>) => ReactNode;
    renderMessageText?: (props: MessageTextProps<TMessage>) => ReactNode;
    renderMessageImage?: (props: MessageImageProps<TMessage>) => ReactNode;
    renderCustomView?: (props: CustomViewProps<TMessage>) => ReactNode;
    renderFooter?: () => ReactNode;
    renderChatEmpty?: () => ReactNode;
    renderLoading?: () => ReactNode;
    renderDay?: (props: DayProps<TMessage>) => ReactNode;
    renderSystemMessage?: (props: SystemMessageProps<TMessage>) => ReactNode;
    renderActions?: (props: ActionsProps) => ReactNode;
    renderTime?: (props: TimeProps<TMessage>) => ReactNode;
    renderQuickReplies?: (props: QuickRepliesProps<TMessage>) => ReactNode;
    renderQuickReplySend?: () => ReactNode;
    minInputToolbarHeight?: number;
    bottomOffset?: number;
    maxInputLength?: number;
    scrollToBottom?: boolean;
    scrollToBottomComponent?: () => ReactNode;
    scrollToBottomOffset?: number;
    scrollToBottomStyle?: StyleProp<ViewStyle>;
    alignTop?: boolean;
    wrapInSafeArea?: boolean;
    extraData?: object;
    messagesContainerStyle?: StyleProp<ViewStyle>;
    listViewProps?: Partial<FlatListProps<TMessage>>;
    textInputProps?: Partial<TextInputProps>;
    keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
    onLongPress?: (context: MessageContext, message: TMessage) => void;
    onPress?: (context: MessageContext, message: TMessage) => void;
    onQuickReply?: (replies: Reply[]) => void;
    parsePatterns?: (linkStyle: TextStyle) => object[];
    onPressAvatar?: (user: User) => void;
    onLongPressAvatar?: (user: User) => void;
    dateFormat?: string;
    timeFormat?: string;
    locale?: string;
    showUserAvatar?: boolean;
    showAvatarForEveryMessage?: boolean;
    renderAvatarOnTop?: boolean;
    isLoadingEarlier?: boolean;
    loadEarlier?: boolean;
    onLoadEarlier?: () => void;
    renderLoadEarlier?: (props: object) => ReactNode;
  }

  // =============================================================================
  // Component Exports
  // =============================================================================

  export const GiftedChat: ComponentType<GiftedChatProps>;
  export const Bubble: ComponentType<BubbleProps>;
  export const InputToolbar: ComponentType<InputToolbarProps>;
  export const Composer: ComponentType<ComposerProps>;
  export const Send: ComponentType<SendProps>;
  export const Avatar: ComponentType<AvatarProps>;
  export const Day: ComponentType<DayProps>;
  export const SystemMessage: ComponentType<SystemMessageProps>;
  export const Time: ComponentType<TimeProps>;
  export const MessageText: ComponentType<MessageTextProps>;
  export const MessageImage: ComponentType<MessageImageProps>;
  export const MessageContainer: ComponentType<object>;
  export const Actions: ComponentType<ActionsProps>;
  export const Message: ComponentType<MessageProps>;
}
