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

const GrueneratorChatMessage = ({ msg, index, onEditRequest, isEditModeActive, activeResultId }) => {
  const { user } = useOptimizedAuth();
  const { data: profile } = useProfile(user?.id);

  const avatarRobotId = profile?.avatar_robot_id ?? 1;
  const displayName = profile?.display_name || '';

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
          {msg.resultData.sharepic && (
            <ImageDisplay
              sharepicData={msg.resultData.sharepic}
              minimal={true}
              className="gruenerator-result-sharepic"
            />
          )}
          <Suspense fallback={<span>{displayText}</span>}>
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
              {displayText}
            </ReactMarkdown>
          </Suspense>
          <ActionButtons
            generatedContent={displayText}
            showEditMode={true}
            onRequestEdit={() => onEditRequest?.(msg.resultData.componentId)}
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
