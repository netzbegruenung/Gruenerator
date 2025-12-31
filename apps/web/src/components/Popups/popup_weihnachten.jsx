import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';
import { BasePopup } from '../common/Popup';
import './popup_weihnachten.css';

const WEIHNACHTEN_CONFIG = {
  storageKey: 'weihnachtenCampaign2025Shown',
  title: 'WEIHNACHTS-',
  titleHighlight: 'GRÜNERATOR',
  subtitle: 'Erstelle dein Weihnachts-Sharepic',
  content: 'Erstelle festliche Weihnachtsgrüße für deinen Orts- oder Kreisverband! Der Weihnachts-Grünerator grüneriert ein 5-zeiliges Gedicht passend zu deinem Heimatort - wähle aus 6 Designs und teile es auf Social Media.',
};

const PopupWeihnachten = () => {
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

  const handleTryNow = () => {
    localStorage.setItem(WEIHNACHTEN_CONFIG.storageKey, 'true');
    window.open('/weihnachten', '_self');
  };

  return (
    <BasePopup
      storageKey={WEIHNACHTEN_CONFIG.storageKey}
      variant="single"
    >
      {({ onClose }) => (
        <div className="popup-single-container">
          <div className="popup-slide start-screen gradient-primary popup-weihnachten">
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

            <div className="popup-weihnachten-preview">
              <motion.div
                className="popup-weihnachten-image-container"
                animate={{ y: [0, -8, 0], rotate: [0, 1, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img
                  src="/images/weihnachten-preview.png"
                  alt="Weihnachts-Sharepic Beispiel"
                  className="popup-weihnachten-image"
                />
                <p className="popup-weihnachten-caption">Beispielbeitrag ohne Bezug zu den Kieler Grünen</p>
              </motion.div>
            </div>

            <div className="popup-slide-content">
              <motion.h1
                className="start-screen-title"
                initial={isMobile ? {} : { y: 50, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.2, duration: 0.6 }}
              >
                <span className="title-normal">{WEIHNACHTEN_CONFIG.title}</span>
                <span className="title-gradient">{WEIHNACHTEN_CONFIG.titleHighlight}</span>
              </motion.h1>

              <motion.p
                className="start-screen-subtitle"
                initial={isMobile ? {} : { y: 30, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.4, duration: 0.5 }}
              >
                {WEIHNACHTEN_CONFIG.subtitle}
              </motion.p>

              <motion.p
                className="start-screen-description"
                initial={isMobile ? {} : { y: 20, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.6, duration: 0.5 }}
              >
                {WEIHNACHTEN_CONFIG.content}
              </motion.p>

              <motion.div
                className="popup-buttons"
                initial={isMobile ? {} : { y: 30, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.8, duration: 0.5 }}
              >
                <motion.button
                  className="popup-button popup-button--primary"
                  onClick={handleTryNow}
                  whileHover={isMobile ? {} : { scale: 1.05 }}
                  whileTap={isMobile ? {} : { scale: 0.95 }}
                >
                  <span>Jetzt erstellen</span>
                  <Icon category="actions" name="arrowRight" />
                </motion.button>
                <motion.button
                  className="popup-button popup-button--secondary"
                  onClick={onClose}
                  whileHover={isMobile ? {} : { scale: 1.05 }}
                  whileTap={isMobile ? {} : { scale: 0.95 }}
                >
                  Später
                </motion.button>
              </motion.div>
            </div>
          </div>
        </div>
      )}
    </BasePopup>
  );
};

export default PopupWeihnachten;
