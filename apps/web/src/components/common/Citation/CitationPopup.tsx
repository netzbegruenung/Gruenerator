import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

interface CitationPopupProps {
  citation: {
    cited_text?: string;
    document_title?: string;
    similarity_score?: number
  };
  badgeRef: Record<string, unknown>;
}

const CitationPopup = ({ citation, badgeRef }: CitationPopupProps): JSX.Element => {
  const [style, setStyle] = useState({ opacity: 0 });
  const popupRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!badgeRef?.current || !popupRef.current) return;

    const badgeRect = badgeRef.current.getBoundingClientRect();
    const popupRect = popupRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const gap = 8;

    let left = badgeRect.left + (badgeRect.width / 2) - (popupRect.width / 2);
    let top = badgeRect.top - popupRect.height - gap;

    if (left < gap) {
      left = gap;
    } else if (left + popupRect.width > windowWidth - gap) {
      left = windowWidth - popupRect.width - gap;
    }

    if (top < gap) {
      top = badgeRect.bottom + gap;
    }

    setStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      opacity: 1,
    });
  }, [badgeRef]);

  useEffect(() => {
    const handleScroll = () => updatePosition();

    const positionFrame = requestAnimationFrame(() => {
      updatePosition();
    });

    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      cancelAnimationFrame(positionFrame);
    };
  }, [updatePosition]);

  if (!citation || !badgeRef?.current) return null;

  const truncatedText = citation.cited_text?.substring(0, 150) || '';
  const displayText = truncatedText.length === 150 ? `${truncatedText}...` : truncatedText;

  return createPortal(
    <span className="citation-popup" ref={popupRef} style={style}>
      <span className="citation-popup-text">
        "{displayText}"
      </span>
      <span className="citation-popup-source">
        {citation.document_title}
      </span>
    </span>,
    document.body
  );
};

export default CitationPopup;
