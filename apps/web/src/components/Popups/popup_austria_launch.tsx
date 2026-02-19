import React from 'react';

import { BasePopup } from '../common/Popup';
import './popup_austria_launch.css';

const PopupAustriaLaunch = () => {
  return (
    <BasePopup storageKey="austriaLaunchVideo2025Shown" variant="single" requireAuth>
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
          </div>
        </div>
      )}
    </BasePopup>
  );
};

export default PopupAustriaLaunch;
