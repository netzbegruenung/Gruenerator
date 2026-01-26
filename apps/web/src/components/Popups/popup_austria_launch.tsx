import React from 'react';

import Icon from '../common/Icon';
import { BasePopup } from '../common/Popup';
import './popup_austria_launch.css';

const PopupAustriaLaunch = () => {
  return (
    <BasePopup storageKey="austriaLaunchVideo2025Shown" variant="single">
      {({ onClose }) => (
        <div className="popup-single-container">
          <div className="popup-slide video-popup">
            <video
              src="/videos/austria-launch.mp4"
              autoPlay
              playsInline
              muted
              onEnded={onClose}
              className="video-popup-player"
            />
            <div className="video-popup-controls">
              <button
                className="video-popup-button video-popup-button--skip"
                onClick={onClose}
              >
                <span>Überspringen</span>
                <Icon category="actions" name="arrowRight" />
              </button>
            </div>
          </div>
        </div>
      )}
    </BasePopup>
  );
};

export default PopupAustriaLaunch;
