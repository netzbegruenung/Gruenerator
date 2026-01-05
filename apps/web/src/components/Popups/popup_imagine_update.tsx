import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import Icon from '../common/Icon';
import { BasePopup, PopupSlider } from '../common/Popup';

interface Slide {
  id: number;
  title: string;
  subtitle: string;
  content: string;
  icon: string;
  iconCategory?: string;
  gradient: string;
  isStartScreen?: boolean;
}

const IMAGINE_UPDATE_CONFIG = {
  storageKey: 'imagineUpdateShown2025',
  slides: [
    {
      id: 1,
      title: 'GRÜNERATOR REIMAGINED',
      subtitle: 'Entdecke den neuen Grünerator',
      content: 'Der neue Grünerator ist da und besser als je zuvor – mit verbesserten Grüneratoren, Sharepics, Bildbearbeitung und vielem mehr. Entdecke jetzt alle neuen Möglichkeiten!',
      icon: 'imagine',
      gradient: 'gradient-primary',
      isStartScreen: true,
    },
    {
      id: 2,
      title: 'Verbesserte Grüneratoren',
      subtitle: 'Nutzt Webrecherche, Dateien und mehr',
      content: 'Eine komplett neue UI, neue Funktionen wie Bürger*innenanfragen, einen Sicherheitsmodus, Linkerkennung und mehr.',
      icon: 'file',
      iconCategory: 'ui',
      gradient: 'gradient-secondary',
    },
    {
      id: 3,
      title: 'Kreiere Sharepics in Sekunden',
      subtitle: 'Professionelle Sharepics für Social Media',
      content: 'Mit KI-Unterstützung erstellst du professionelle Sharepics für Social Media in wenigen Sekunden. Einfach Thema eingeben und fertig gestaltet erhalten.',
      icon: 'sharepic',
      iconCategory: 'navigation',
      gradient: 'gradient-accent',
    },
    {
      id: 4,
      title: 'Verwandle Bilder mit KI-Power',
      subtitle: 'Verändere die Welt mit Grünerator Imagine',
      content: 'Zeige allen Leuten, wie deine Straße auch aussehen könnte. Mit Radwegen, Bäumen und vielem mehr.',
      icon: 'imagine',
      iconCategory: 'navigation',
      gradient: 'gradient-neutral',
    },
    {
      id: 5,
      title: 'Neuer, runderneuerter Reel-Grünerator',
      subtitle: 'Generiere Untertitel für Reels & TikToks',
      content: 'Generiere automatisch ansprechende Untertitel für deine Videos. Mit verbesserter Videoverarbeitung und neuen, schöneren Untertiteln.',
      icon: 'video',
      iconCategory: 'ui',
      gradient: 'gradient-primary',
    },
    {
      id: 6,
      title: 'Europäisch und Sicher',
      subtitle: 'Datenschutz und Sicherheit stehen an erster Stelle',
      content: 'Verwendet Standardmäßig führende Dienstleister aus Frankreich und Freiburg. Europäisches Geld für europäische Technologie!',
      icon: 'shield',
      iconCategory: 'ui',
      gradient: 'gradient-accent',
    },
    {
      id: 7,
      title: 'Erstelle dein Profil',
      subtitle: 'Personalisiere deine Grünerator-Erfahrung',
      content: 'Logge dich mit deinem Grünen Login ein und passe den Grünerator an deine Bedürfnisse an. Erstelle eigene Grüneratoren, passe Prompts an und speichere Wissen dauerhaft.',
      icon: 'user',
      iconCategory: 'ui',
      gradient: 'gradient-secondary',
    },
    {
      id: 8,
      title: 'Jetzt starten!',
      subtitle: 'Erlebe die Zukunft der KI-gestützten Arbeit',
      content: 'Starte jetzt mit dem Grünerator und transformiere deine Arbeitsweise mit KI-Power für alle deine grünen Inhalte.',
      icon: 'assistant',
      iconCategory: 'ui',
      gradient: 'gradient-neutral',
    },
  ] as Slide[],
};

interface StartScreenSlideProps {
  slide: Slide;
  isMobile: boolean;
  onNext: () => void;
}

const StartScreenSlide = ({ slide, isMobile, onNext }: StartScreenSlideProps) => (
  <>
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
        <div className="preview-icon">🎨</div>
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
        <div className="preview-icon">🚀</div>
      </motion.div>
    </div>

    <div className="popup-slide-content">
      <motion.h1
        className="start-screen-title"
        initial={isMobile ? {} : { y: 50, opacity: 0 }}
        animate={isMobile ? {} : { y: 0, opacity: 1 }}
        transition={isMobile ? {} : { delay: 0.2, duration: 0.6 }}
      >
        <span className="title-normal">GRÜNERATOR </span>
        <span className="title-gradient">REIMAGINED</span>
      </motion.h1>

      <motion.p
        className="start-screen-subtitle"
        initial={isMobile ? {} : { y: 30, opacity: 0 }}
        animate={isMobile ? {} : { y: 0, opacity: 1 }}
        transition={isMobile ? {} : { delay: 0.4, duration: 0.5 }}
      >
        {slide.subtitle}
      </motion.p>

      <motion.p
        className="start-screen-description"
        initial={isMobile ? {} : { y: 20, opacity: 0 }}
        animate={isMobile ? {} : { y: 0, opacity: 1 }}
        transition={isMobile ? {} : { delay: 0.6, duration: 0.5 }}
      >
        {slide.content}
      </motion.p>

      <motion.button
        className="start-screen-button"
        onClick={onNext}
        initial={isMobile ? {} : { y: 30, opacity: 0 }}
        animate={isMobile ? {} : { y: 0, opacity: 1 }}
        transition={isMobile ? {} : { delay: 0.8, duration: 0.5 }}
        whileHover={isMobile ? {} : { scale: 1.05 }}
        whileTap={isMobile ? {} : { scale: 0.95 }}
      >
        <span>Entdecken</span>
        <Icon category="actions" name="arrowRight" />
      </motion.button>
    </div>
  </>
);

interface ContentSlideProps {
  slide: Slide;
  isMobile: boolean;
}

const ContentSlide = ({ slide, isMobile }: ContentSlideProps) => (
  <div className="popup-slide-content">
    <motion.div
      className="popup-slide-text"
      initial={isMobile ? {} : { x: -30, opacity: 0 }}
      animate={isMobile ? {} : { x: 0, opacity: 1 }}
      transition={isMobile ? {} : { delay: 0.2, duration: 0.5 }}
    >
      <motion.h2
        className="popup-slide-title"
        initial={isMobile ? {} : { y: 20, opacity: 0 }}
        animate={isMobile ? {} : { y: 0, opacity: 1 }}
        transition={isMobile ? {} : { delay: 0.3, duration: 0.4 }}
      >
        {slide.title}
      </motion.h2>

      <motion.h3
        className="popup-slide-subtitle"
        initial={isMobile ? {} : { y: 15, opacity: 0 }}
        animate={isMobile ? {} : { y: 0, opacity: 1 }}
        transition={isMobile ? {} : { delay: 0.4, duration: 0.4 }}
      >
        {slide.subtitle}
      </motion.h3>

      <motion.p
        className="popup-slide-description"
        initial={isMobile ? {} : { y: 15, opacity: 0 }}
        animate={isMobile ? {} : { y: 0, opacity: 1 }}
        transition={isMobile ? {} : { delay: 0.5, duration: 0.4 }}
      >
        {slide.content}
      </motion.p>
    </motion.div>

    <motion.div
      className="popup-slide-icon-container"
      initial={isMobile ? {} : { x: 30, opacity: 0, scale: 0.8 }}
      animate={isMobile ? {} : { x: 0, opacity: 1, scale: 1 }}
      transition={isMobile ? {} : { delay: 0.3, duration: 0.5, type: 'spring' }}
    >
      <div className="popup-slide-icon">
        <Icon category={slide.iconCategory || 'ui'} name={slide.icon || 'file'} />
      </div>
    </motion.div>
  </div>
);

const ImagineUpdatePopup = () => {
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

  const handleStartExploring = () => {
    window.open('/', '_self');
  };

  interface RenderSlideProps {
    slide: Slide;
    isMobile: boolean;
    onNext: () => void;
  }

  const renderSlide = ({ slide, isMobile: isMobileView, onNext }: RenderSlideProps) => (
    <div className={`popup-slide ${slide.gradient} ${slide.isStartScreen ? 'start-screen' : ''}`}>
      {slide.isStartScreen ? (
        <StartScreenSlide slide={slide} isMobile={isMobileView} onNext={onNext} />
      ) : (
        <>
          {isMobileView && (
            <>
              <div className="swipe-indicator swipe-indicator-left">
                <Icon category="ui" name="arrowLeft" />
              </div>
              <div className="swipe-indicator swipe-indicator-right">
                <Icon category="ui" name="arrowRight" />
              </div>
            </>
          )}
          <ContentSlide slide={slide} isMobile={isMobileView} />
        </>
      )}
    </div>
  );

  interface RenderFooterProps {
    isLastSlide: boolean;
    onClose: () => void;
  }

  const renderFooter = ({ isLastSlide, onClose }: RenderFooterProps) => {
    if (!isLastSlide) return null;

    return (
      <div className="popup-buttons">
        <button
          onClick={handleStartExploring}
          className="popup-button popup-button--primary"
        >
          Jetzt ausprobieren
          <Icon category="actions" name="arrowRight" />
        </button>
        <button
          onClick={onClose}
          className="popup-button popup-button--secondary"
        >
          Später
        </button>
      </div>
    );
  };

  return (
    <BasePopup
      storageKey={IMAGINE_UPDATE_CONFIG.storageKey}
      variant="slider"
    >
      {({ onClose }) => (
        <PopupSlider
          slides={IMAGINE_UPDATE_CONFIG.slides}
          onClose={onClose}
          renderSlide={(props: any) => renderSlide({ ...props, isMobile })}
          renderFooter={renderFooter}
        />
      )}
    </BasePopup>
  );
};

export default ImagineUpdatePopup;
