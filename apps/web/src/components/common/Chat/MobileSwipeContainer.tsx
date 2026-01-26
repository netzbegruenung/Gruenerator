import { motion } from 'motion/react';
import { type JSX, useCallback, type ReactNode } from 'react';

import useSwipeNavigation from '../../../hooks/useSwipeNavigation';
import './MobileSwipeContainer.css';

type PanelType = 'chat' | 'results';

interface MobileSwipeContainerProps {
  chatPanel: ReactNode;
  resultsPanel: ReactNode;
  activePanel?: PanelType;
  onPanelChange?: (panel: PanelType) => void;
  inputElement?: ReactNode;
  swipeEnabled?: boolean;
}

const MobileSwipeContainer = ({
  chatPanel,
  resultsPanel,
  activePanel = 'results',
  onPanelChange,
  inputElement,
  swipeEnabled = true,
}: MobileSwipeContainerProps): JSX.Element => {
  const handleSwipeLeft = useCallback(() => {
    if (activePanel === 'results') {
      onPanelChange?.('chat');
    }
  }, [activePanel, onPanelChange]);

  const handleSwipeRight = useCallback(() => {
    if (activePanel === 'chat') {
      onPanelChange?.('results');
    }
  }, [activePanel, onPanelChange]);

  const touchHandlers = useSwipeNavigation({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 50,
    enabled: swipeEnabled,
  });

  return (
    <div className="mobile-swipe-container">
      <motion.div
        className="mobile-swipe-panels"
        animate={{ x: activePanel === 'chat' ? '-50%' : '0%' }}
        transition={{ type: 'tween', ease: 'easeOut', duration: 0.3 }}
        {...touchHandlers}
      >
        <div className="mobile-swipe-panel mobile-swipe-results">{resultsPanel}</div>
        <div className="mobile-swipe-panel mobile-swipe-chat">{chatPanel}</div>
      </motion.div>

      <div className="mobile-swipe-indicator">
        <span
          className={`mobile-swipe-dot ${activePanel === 'chat' ? 'active' : ''}`}
          onClick={() => onPanelChange?.('chat')}
          role="button"
          tabIndex={0}
          aria-label="Chat anzeigen"
        />
        <span
          className={`mobile-swipe-dot ${activePanel === 'results' ? 'active' : ''}`}
          onClick={() => onPanelChange?.('results')}
          role="button"
          tabIndex={0}
          aria-label="Ergebnisse anzeigen"
        />
      </div>

      <div className="mobile-swipe-input">{inputElement}</div>
    </div>
  );
};

export default MobileSwipeContainer;
