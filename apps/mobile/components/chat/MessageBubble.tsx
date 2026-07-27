import { MessagePrimitive, useAuiState } from '@assistant-ui/react-native';
import { memo } from 'react';

import { AssistantMessage } from './message/AssistantMessage';
import { FollowUpSuggestions } from './message/FollowUpSuggestions';
import { UserMessage } from './message/UserMessage';
import { MessageEditComposer } from './MessageEditComposer';

/**
 * One row of the thread. Nothing but the switch — which shape a message takes
 * lives in `./message/`.
 */
export const MessageBubble = memo(function MessageBubble() {
  // The edit branch lives here rather than in ThreadPrimitive.Messages'
  // `EditComposer` slot: that slot only exists on the deprecated `components`
  // prop, and the children render function this thread now uses does not switch
  // on editing state at all.
  const isEditing = useAuiState((s) => s.message.composer.isEditing);
  if (isEditing) return <MessageEditComposer />;

  return (
    <>
      <MessagePrimitive.If user>
        <UserMessage />
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <AssistantMessage />
        <FollowUpSuggestions />
      </MessagePrimitive.If>
    </>
  );
});
