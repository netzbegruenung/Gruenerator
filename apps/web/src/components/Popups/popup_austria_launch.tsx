import React from 'react';

import { BasePopup } from '../common/Popup';

const PopupAustriaLaunch = () => {
  return (
    <BasePopup storageKey="austriaLaunchVideo2025Shown" variant="single" requireAuth>
      {({ onClose }) => (
        <div className="flex flex-col items-center justify-center h-full aspect-square">
          <div className="bg-black p-0 flex flex-col items-center justify-center relative w-full h-full">
            <video
              src="/videos/austria-launch.mp4"
              autoPlay
              playsInline
              muted
              onEnded={onClose}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
    </BasePopup>
  );
};

export default PopupAustriaLaunch;
