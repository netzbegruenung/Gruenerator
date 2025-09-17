import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation } from 'react-router-dom';
import Icon from '../common/Icon';
import '../../assets/styles/components/popups/imagine-update-popup.css';

const ImagineUpdatePopup = () => {
  const location = useLocation();
  const isNoHeaderFooterRoute = location.pathname.includes('-no-header-footer');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const intervalRef = useRef(null);

  const [isVisible, setIsVisible] = useState(() => {
    if (isNoHeaderFooterRoute) return false;
    return !localStorage.getItem('imagineUpdateShown2025');
  });

  // Slide content
  const slides = [
    {
      id: 1,
    title: "GRÜNERATOR REIMAGINED",
      subtitle: "Entdecke den neuen Grünerator",
      content: "Der neue Grünerator ist da und besser als je zuvor – mit verbesserten Grüneratoren, Sharepics, Bildbearbeitung und vielem mehr. Entdecke jetzt alle neuen Möglichkeiten!",
      icon: "imagine",
      gradient: "start-screen",
      isStartScreen: true
    },
    {
      id: 2,
      title: "Verbesserte Grüneratoren",
      subtitle: "Nutzt Webrecherche, Dateien und mehr",
      content: "Eine komplett neue UI, neue Funktionen wie Bürger*innenanfragen, einen Sicherheitsmodus, Linkerkennung und mehr.",
      icon: "file",
      iconCategory: "ui",
      gradient: "from-secondary-500 to-accent-500"
    },
    {
      id: 3,
      title: "Kreiere Sharepics in Sekunden",
      subtitle: "Professionelle Sharepics für Social Media",
      content: "Mit KI-Unterstützung erstellst du professionelle Sharepics für Social Media in wenigen Sekunden. Einfach Thema eingeben und fertig gestaltet erhalten.",
      icon: "sharepic",
      iconCategory: "navigation",
      gradient: "from-accent-500 to-neutral-500"
    },
    {
      id: 4,
      title: "Verwandle Bilder mit KI-Power",
      subtitle: "Verändere die Welt mit Grünerator Imagine",
      content: "Zeige allen Leuten, wie deine Straße auch aussehen könnte. Mit Radwegen, Bäumen und vielem mehr.",
      icon: "imagine",
      iconCategory: "navigation",
      gradient: "from-neutral-500 to-primary-500"
    },
    {
      id: 5,
      title: "Neuer, runderneuerter Reel-Grünerator",
      subtitle: "Generiere Untertitel für Reels & TikToks",
      content: "Generiere automatisch ansprechende Untertitel für deine Videos. Mit verbesserter Videoverarbeitung und neuen, schöneren Untertiteln.",
      icon: "video",
      iconCategory: "ui",
      gradient: "from-primary-600 to-secondary-600"
    },
    {
      id: 6,
      title: "Europäisch und Sicher",
      subtitle: "Datenschutz und Sicherheit stehen an erster Stelle",
      content: "Verwendet Standardmäßig führende Dienstleister aus Frankreich und Freiburg. Europäisches Geld für europäische Technologie!",
      icon: "shield",
      iconCategory: "ui",
      gradient: "from-accent-500 to-primary-600"
    },
    {
      id: 7,
      title: "Erstelle dein Profil",
      subtitle: "Personalisiere deine Grünerator-Erfahrung",
      content: "Logge dich mit deinem Grünen Login ein und passe den Grünerator an deine Bedürfnisse an. Erstelle eigene Grüneratoren, passe Prompts an und speichere Wissen dauerhaft.",
      icon: "user",
      iconCategory: "ui",
      gradient: "from-primary-500 to-accent-500"
    },
    {
      id: 8,
      title: "Jetzt starten!",
      subtitle: "Erlebe die Zukunft der KI-gestützten Arbeit",
      content: "Starte jetzt mit dem Grünerator und transformiere deine Arbeitsweise mit KI-Power für alle deine grünen Inhalte.",
      icon: "assistant",
      iconCategory: "ui",
      gradient: "from-secondary-600 to-accent-600"
    }
  ];

  const totalSlides = slides.length;

  // Auto-advance functionality (disabled)
  // useEffect(() => {
  //   if (isAutoPlaying && isVisible && !slides[currentSlide].isStartScreen) {
  //     intervalRef.current = setInterval(() => {
  //       setCurrentSlide(prev => (prev + 1) % totalSlides);
  //     }, 4000);
  //   }

  //   return () => {
  //     if (intervalRef.current) {
  //       clearInterval(intervalRef.current);
  //     }
  //   };
  // }, [isAutoPlaying, isVisible, totalSlides, currentSlide, slides]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isVisible) return;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides);
          setIsAutoPlaying(false);
          break;
        case 'ArrowRight':
          event.preventDefault();
          setCurrentSlide(prev => (prev + 1) % totalSlides);
          setIsAutoPlaying(false);
          break;
        case 'Escape':
          event.preventDefault();
          handleClosePopup();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, totalSlides]);

  // Touch handlers
  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      setCurrentSlide(prev => (prev + 1) % totalSlides);
      setIsAutoPlaying(false);
    }
    if (isRightSwipe) {
      setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides);
      setIsAutoPlaying(false);
    }
  };

  const handleClosePopup = useCallback(() => {
    localStorage.setItem('imagineUpdateShown2025', 'true');
    setIsVisible(false);
  }, []);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && window.innerWidth <= 768) {
      handleClosePopup();
    }
  };

  const handlePrevSlide = () => {
    setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides);
    setIsAutoPlaying(false);
  };

  const handleNextSlide = () => {
    setCurrentSlide(prev => (prev + 1) % totalSlides);
    setIsAutoPlaying(false);
  };

  const handleDotClick = (index) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
  };

  const handleMouseEnter = () => {
    setIsAutoPlaying(false);
  };

  const handleMouseLeave = () => {
    setIsAutoPlaying(true);
  };

  const handleStartExploring = () => {
    window.open('/imagine', '_self');
    handleClosePopup();
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="imagine-update-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleOverlayClick}
      >
        <motion.div
          className="imagine-update-modal"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Close Button */}
          <button
            className="imagine-update-close"
            onClick={handleClosePopup}
            aria-label="Popup schließen"
          >
            <Icon category="actions" name="close" />
          </button>


          {/* Slider Container */}
          <div
            className="imagine-update-slider"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                className={`imagine-update-slide ${slides[currentSlide].gradient} ${slides[currentSlide].isStartScreen ? 'start-screen' : ''}`}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                {/* Floating Particles for Start Screen */}
                {slides[currentSlide].isStartScreen && (
                  <div className="imagine-particles">
                    {[...Array(20)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="particle"
                        initial={{
                          opacity: 0,
                          y: Math.random() * 500 + 50,
                          x: Math.random() * 800 + 50
                        }}
                        animate={{
                          opacity: [0, 0.8, 0],
                          scale: [0.5, 1, 0.5]
                        }}
                        transition={{
                          duration: 3 + Math.random() * 2,
                          repeat: Infinity,
                          delay: i * 0.2,
                          ease: "easeInOut"
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Preview Cards for Start Screen */}
                {slides[currentSlide].isStartScreen && (
                  <div className="imagine-preview-cards">
                    <motion.div
                      className="preview-card preview-card-1"
                      animate={{
                        y: [0, -10, 0],
                        rotate: [0, 2, 0]
                      }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <div className="preview-icon">🎨</div>
                    </motion.div>
                    <motion.div
                      className="preview-card preview-card-2"
                      animate={{
                        y: [0, -15, 0],
                        rotate: [0, -2, 0]
                      }}
                      transition={{ duration: 4, repeat: Infinity, delay: 1 }}
                    >
                      <div className="preview-icon">✨</div>
                    </motion.div>
                    <motion.div
                      className="preview-card preview-card-3"
                      animate={{
                        y: [0, -8, 0],
                        rotate: [0, 1, 0]
                      }}
                      transition={{ duration: 3.5, repeat: Infinity, delay: 2 }}
                    >
                      <div className="preview-icon">🚀</div>
                    </motion.div>
                  </div>
                )}

                <div className="imagine-update-slide-content">
                  {!slides[currentSlide].isStartScreen ? (
                    <>
                      <motion.div
                        className="slide-text-content"
                        initial={{ x: -30, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        <motion.h2
                          className="imagine-update-slide-title"
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.3, duration: 0.4 }}
                        >
                          {slides[currentSlide].title}
                        </motion.h2>

                        <motion.h3
                          className="imagine-update-slide-subtitle"
                          initial={{ y: 15, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.4, duration: 0.4 }}
                        >
                          {slides[currentSlide].subtitle}
                        </motion.h3>

                        <motion.p
                          className="imagine-update-slide-text"
                          initial={{ y: 15, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.5, duration: 0.4 }}
                        >
                          {slides[currentSlide].content}
                        </motion.p>
                      </motion.div>

                      <motion.div
                        className="slide-icon-container"
                        initial={{ x: 30, opacity: 0, scale: 0.8 }}
                        animate={{ x: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, duration: 0.5, type: "spring" }}
                      >
                        <div className="imagine-update-slide-icon">
                          <Icon category={slides[currentSlide].iconCategory || "ui"} name={slides[currentSlide].icon || "file"} />
                        </div>
                      </motion.div>
                    </>
                  ) : (
                    <>
                      {/* Special Start Screen Layout */}
                      <motion.h1
                        className="start-screen-title"
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                      >
                        <span className="title-normal">GRÜNERATOR </span>
                        <span className="title-gradient">REIMAGINED</span>
                      </motion.h1>

                      <motion.p
                        className="start-screen-subtitle"
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                      >
                        {slides[currentSlide].subtitle}
                      </motion.p>

                      <motion.p
                        className="start-screen-description"
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                      >
                        {slides[currentSlide].content}
                      </motion.p>

                      <motion.button
                        className="start-screen-button"
                        onClick={handleNextSlide}
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.8, duration: 0.5 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span>Entdecken</span>
                        <Icon category="actions" name="arrowRight" />
                      </motion.button>
                    </>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Arrows */}
            <button
              className="imagine-update-nav imagine-update-nav-prev"
              onClick={handlePrevSlide}
              aria-label="Vorherige Folie"
            >
              <Icon category="ui" name="arrowLeft" />
            </button>

            <button
              className="imagine-update-nav imagine-update-nav-next"
              onClick={handleNextSlide}
              aria-label="Nächste Folie"
            >
              <Icon category="ui" name="arrowRight" />
            </button>
          </div>

          {/* Navigation Dots - positioned over the popup */}
          <div className="imagine-update-dots-overlay">
            {slides.map((_, index) => (
              <button
                key={index}
                className={`imagine-update-dot ${index === currentSlide ? 'active' : ''}`}
                onClick={() => handleDotClick(index)}
                aria-label={`Zu Folie ${index + 1} wechseln`}
              />
            ))}
          </div>

          {/* Footer */}
          <motion.div
            className="imagine-update-footer"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            {currentSlide === totalSlides - 1 ? (
              <div className="imagine-update-buttons">
                <button
                  onClick={handleStartExploring}
                  className="imagine-update-button imagine-update-button-primary"
                >
                  Jetzt ausprobieren
                  <Icon category="actions" name="arrowRight" />
                </button>
                <button
                  onClick={handleClosePopup}
                  className="imagine-update-button imagine-update-button-secondary"
                >
                  Später
                </button>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ImagineUpdatePopup;