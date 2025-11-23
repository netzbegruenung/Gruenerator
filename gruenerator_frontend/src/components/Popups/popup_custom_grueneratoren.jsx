import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';
import { BasePopup } from '../common/Popup';

const CUSTOM_GRUENERATOREN_CONFIG = {
  storageKey: 'customGrueneratorenBetaShown2025',
  title: 'EIGENE GRÜNERATOREN',
  titleHighlight: 'OPEN BETA',
  subtitle: 'Erstelle deine eigenen KI-Assistenten',
  content: 'Ab sofort kannst du eigene Grüneratoren erstellen und personalisieren. Passe Prompts an und teile deine Kreationen mit anderen.',
};

const CustomGrueneratorenPopup = () => {
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
    localStorage.setItem(CUSTOM_GRUENERATOREN_CONFIG.storageKey, 'true');
    window.open('/profile', '_self');
  };

  return (
    <BasePopup
      storageKey={CUSTOM_GRUENERATOREN_CONFIG.storageKey}
      variant="single"
    >
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

            <div className="popup-preview-cards">
              <motion.div
                className="preview-card preview-card-1"
                animate={{ y: [0, -10, 0], rotate: [0, 2, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <div className="preview-icon">🛠️</div>
              </motion.div>
              <motion.div
                className="preview-card preview-card-2"
                animate={{ y: [0, -15, 0], rotate: [0, -2, 0] }}
                transition={{ duration: 4, repeat: Infinity, delay: 1 }}
              >
                <div className="preview-icon">✨</div>
              </motion.div>
              <motion.div
                className="preview-card preview-card-3"
                animate={{ y: [0, -8, 0], rotate: [0, 1, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, delay: 2 }}
              >
                <div className="preview-icon">🤖</div>
              </motion.div>
            </div>

            <div className="popup-slide-content">
              <motion.h1
                className="start-screen-title"
                initial={isMobile ? {} : { y: 50, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.2, duration: 0.6 }}
              >
                <span className="title-normal">{CUSTOM_GRUENERATOREN_CONFIG.title} </span>
                <span className="title-gradient">{CUSTOM_GRUENERATOREN_CONFIG.titleHighlight}</span>
              </motion.h1>

              <motion.p
                className="start-screen-subtitle"
                initial={isMobile ? {} : { y: 30, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.4, duration: 0.5 }}
              >
                {CUSTOM_GRUENERATOREN_CONFIG.subtitle}
              </motion.p>

              <motion.p
                className="start-screen-description"
                initial={isMobile ? {} : { y: 20, opacity: 0 }}
                animate={isMobile ? {} : { y: 0, opacity: 1 }}
                transition={isMobile ? {} : { delay: 0.6, duration: 0.5 }}
              >
                {CUSTOM_GRUENERATOREN_CONFIG.content}
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
                  <span>Ausprobieren</span>
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

export default CustomGrueneratorenPopup;
