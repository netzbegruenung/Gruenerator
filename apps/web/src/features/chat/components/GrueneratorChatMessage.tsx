import React, { lazy, Suspense, useMemo, memo } from 'react';
import { motion } from 'motion/react';
import ActionButtons from '../../../components/common/ActionButtons';
import ImageDisplay from '../../../components/common/ImageDisplay';
import AssistantAvatar from '../../../components/common/Chat/AssistantAvatar';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useProfile } from '../../../features/auth/hooks/useProfileData';
import { getAvatarDisplayProps } from '../../../features/auth/services/profileApiService';
import { MESSAGE_MOTION_PROPS, MARKDOWN_COMPONENTS } from '../../../components/common/Chat/utils/chatMessageUtils';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import '../../../assets/styles/components/chat/gruenerator-message.css';

const ReactMarkdown = lazy(() => import('react-markdown'));

interface ProfileData {
  avatar_robot_id?: number | string;
  display_name?: string;
}

interface ResultData {
  componentId?: string;
  text?: string;
  imageUrl?: string;
  type?: string;
  images?: string[];
  sharepic?: unknown;
}

interface ChatMessage {
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp?: number;
  resultData?: ResultData;
  userName?: string;
}

interface GrueneratorChatMessageProps {
  msg: ChatMessage;
  index: number;
  onEditRequest: (componentId: string) => void;
  isEditModeActive: boolean;
  activeResultId: string | null;
}

const GrueneratorChatMessage = ({ msg, index, onEditRequest, isEditModeActive, activeResultId }: GrueneratorChatMessageProps): React.ReactElement => {
  const { user } = useOptimizedAuth();
  const { data: profile } = useProfile(user?.id);
  const typedProfile = profile as ProfileData | undefined;

  const avatarRobotId = typedProfile?.avatar_robot_id ?? 1;
  const displayName = typedProfile?.display_name || '';

  const userAvatarProps = useMemo(() => {
    return getAvatarDisplayProps({
      avatar_robot_id: avatarRobotId,
      display_name: displayName,
      email: user?.email
    });
  }, [avatarRobotId, displayName, user?.email]);

  const hasResultData = msg.type === 'assistant' && msg.resultData;
  const isActive = hasResultData && msg.resultData?.componentId === activeResultId;

  const componentId = msg.resultData?.componentId;
  const storeContent = useGeneratedTextStore(
    state => componentId ? state.generatedTexts?.[componentId] : null
  );

  const displayText = useMemo(() => {
    if (!hasResultData) return '';
    if (!storeContent) return msg.resultData?.text || '';

    if (typeof storeContent === 'string') return storeContent;
    if (typeof storeContent === 'object') {
      return storeContent.content || storeContent.text || msg.resultData?.text || '';
    }
    return msg.resultData?.text || '';
  }, [hasResultData, storeContent, msg.resultData?.text]);

  return (
    <motion.div
      key={msg.timestamp || index}
      className={`chat-message ${msg.type}${hasResultData ? ' chat-message-with-result' : ''}${isActive ? ' editing' : ''}`}
      {...MESSAGE_MOTION_PROPS}
    >
      {msg.type === 'user' && msg.userName && (
        <div className="chat-message-user-name">{msg.userName}</div>
      )}
      {msg.type === 'assistant' && (
        <AssistantAvatar avatarProps={userAvatarProps} />
      )}

      {hasResultData ? (
        <div className="gruenerator-result-content">
          {msg.resultData?.sharepic && (
            <div className="gruenerator-result-sharepic">
              <ImageDisplay
                sharepicData={msg.resultData?.sharepic}
                minimal={true}
              />
            </div>
          )}
          <Suspense fallback={<span>{displayText}</span>}>
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
              {displayText}
            </ReactMarkdown>
          </Suspense>
          <ActionButtons
            generatedContent={displayText}
            showEditMode={true}
            onRequestEdit={() => onEditRequest?.(msg.resultData?.componentId || '')}
            isEditModeActive={isActive && isEditModeActive}
            showExportDropdown={true}
            showUndo={false}
            showRedo={false}
            className="gruenerator-message-actions"
          />
        </div>
      ) : (
        <div className="chat-message-content">
          <Suspense fallback={<span>{msg.content}</span>}>
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
              {msg.content}
            </ReactMarkdown>
          </Suspense>
        </div>
      )}
    </motion.div>
  );
};

export default memo(GrueneratorChatMessage);
