import { motion } from 'motion/react';
import React, { useState, useEffect } from 'react';

import Icon from '../common/Icon';
import { BasePopup } from '../common/Popup';

const AUSTRIA_LAUNCH_CONFIG = {
  storageKey: 'austriaLaunch2025Shown',
  title: 'GRÜNERATOR',
  titleHighlight: 'FÜR ÖSTERREICH',
  subtitle: 'Ab jetzt auch in Österreich verfügbar!',
  content:
    'Der Grünerator ist jetzt auch für die österreichischen Grünen verfügbar! Erstelle Texte und mehr mit österreichischer Lokalisierung.',
};

const PopupAustriaLaunch = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const setAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    };

    const handleResize = () => {
      setAppHeight();
      setIsMobile(window.innerWidth <= 768);
    };

    setAppHeight();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return (
    <BasePopup storageKey={AUSTRIA_LAUNCH_CONFIG.storageKey} variant="single">
      {({ onClose }) => (
        <div className="popup-single-container">
          <div className="popup-slide start-screen gradient-primary">
            <div className="popup-particles">
              {[...Array(isMobile ? 8 : 20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="particle"
                  initial={{
                    opacity: 0,
                    y: Math.random() * 500 + 50,
                    x: Math.random() * 800 + 50,
                  }}
                  animate={{
                    opacity: [0, 0.8, 0],
                    scale: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>

            <div className="popup-slide-content">
              <motion.h1
                className="start-screen-title"
                initial={isMobile ? {} : { y: 50, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.2, duration: 0.6 }}
              >
                <span className="title-normal">{AUSTRIA_LAUNCH_CONFIG.title} </span>
                <span className="title-gradient">{AUSTRIA_LAUNCH_CONFIG.titleHighlight}</span>
              </motion.h1>

              <motion.p
                className="start-screen-subtitle"
                initial={isMobile ? {} : { y: 30, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.4, duration: 0.5 }}
              >
                {AUSTRIA_LAUNCH_CONFIG.subtitle}
              </motion.p>

              <motion.p
                className="start-screen-description"
                initial={isMobile ? {} : { y: 20, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.6, duration: 0.5 }}
              >
                {AUSTRIA_LAUNCH_CONFIG.content}
              </motion.p>

              <motion.div
                className="popup-buttons"
                initial={isMobile ? {} : { y: 30, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.8, duration: 0.5 }}
              >
                <motion.button
                  className="popup-button popup-button--primary"
                  onClick={onClose}
                  whileHover={isMobile ? {} : { scale: 1.05 }}
                  whileTap={isMobile ? {} : { scale: 0.95 }}
                >
                  <span>Los geht's</span>
                  <Icon category="actions" name="arrowRight" />
                </motion.button>
              </motion.div>
            </div>
          </div>
        </div>
      )}
    </BasePopup>
  );
};

export default PopupAustriaLaunch;
