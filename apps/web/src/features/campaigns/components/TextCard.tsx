import { useState } from 'react';
import CopyButton from '../../../components/common/CopyButton';
import { truncateMiddle } from '../../../utils/textUtils';

interface TextCardProps {
  text: {
    title?: string;
    content: string
  };
}

const TextCard = ({ text }: TextCardProps): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false);
  const maxLength = 300;
  const needsTruncation = text.content.length > maxLength;
  const displayContent = isExpanded ? text.content : truncateMiddle(text.content, maxLength);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="text-card">
      <div className="text-icon">💬</div>
      <div className="text-info">
        <h3>{text.title}</h3>
        <p className="text-content" style={{ whiteSpace: isExpanded ? 'pre-wrap' : 'normal' }}>
          {displayContent}
        </p>
        {needsTruncation && (
          <button onClick={toggleExpand} className="expand-toggle-button">
            {isExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
          </button>
        )}
        <CopyButton content={text.content} compact={true} />
      </div>
    </div>
  );
};

export default TextCard;
