import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import PropTypes from 'prop-types';

// Hilfsfunktion für zufällige Werte
const random = (min, max) => Math.random() * (max - min) + min;

// Bubble-Komponente für einzelne Blasen
const Bubble = ({ size, delay, duration, x, shouldReduceMotion }) => {
  // Vereinfachte Animation bei reduziertem Bewegungsmodus
  const animation = shouldReduceMotion 
    ? { opacity: [0.7, 0] }
    : { 
        y: [0, -120],
        x: [0, x],
        opacity: [0.7, 0],
        scale: [1, 1.2, 0.8]
      };
  
  return (
    <motion.div
      className="bubble"
      initial={{ opacity: 0 }}
      animate={animation}
      transition={{
        duration: duration,
        delay: delay,
        ease: "easeOut"
      }}
      style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.5), rgba(161, 224, 186, 0.6))',
        boxShadow: '0 0 2px rgba(255, 255, 255, 0.8) inset',
        zIndex: 1
      }}
    />
  );
};

Bubble.propTypes = {
  size: PropTypes.number.isRequired,
  delay: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
  x: PropTypes.number.isRequired,
  shouldReduceMotion: PropTypes.bool.isRequired
};

const BubbleAnimation = ({ isActive, onBurst }) => {
  const shouldReduceMotion = useReducedMotion();
  const [bubbles, setBubbles] = useState([]);
  const nextBubbleId = useRef(0);
  const containerRef = useRef(null);
  
  // Blasen hinzufügen beim Klicken (Burst-Effekt)
  useEffect(() => {
    if (onBurst) {
      const newBubbles = [];
      // 8-12 Blasen für den Burst-Effekt erzeugen
      const burstCount = shouldReduceMotion ? 5 : random(8, 12);
      
      for (let i = 0; i < burstCount; i++) {
        newBubbles.push({
          id: nextBubbleId.current++,
          size: random(8, 20),
          delay: random(0, 0.2),
          duration: random(1, 2),
          x: random(-30, 30)
        });
      }
      
      setBubbles(prev => [...prev, ...newBubbles]);
      
      // Blasen nach ihrer Animation entfernen
      const timeout = setTimeout(() => {
        setBubbles(prev => prev.filter(bubble => !newBubbles.some(b => b.id === bubble.id)));
      }, 2500);
      
      return () => clearTimeout(timeout);
    }
  }, [onBurst, shouldReduceMotion]);
  
  // Regelmäßig einzelne Blasen hinzufügen, wenn Tab aktiv ist
  useEffect(() => {
    if (!isActive) return;
    
    const addRandomBubble = () => {
      const newBubble = {
        id: nextBubbleId.current++,
        size: random(6, 15),
        delay: 0,
        duration: random(1.5, 3),
        x: random(-20, 20)
      };
      
      setBubbles(prev => [...prev, newBubble]);
      
      // Blase nach ihrer Animation entfernen
      setTimeout(() => {
        setBubbles(prev => prev.filter(bubble => bubble.id !== newBubble.id));
      }, (newBubble.delay + newBubble.duration) * 1000 + 500);
    };
    
    // Alle 2-6 Sekunden eine neue Blase hinzufügen
    const interval = setInterval(() => {
      addRandomBubble();
    }, random(2000, 6000));
    
    // Sofort eine Blase hinzufügen, wenn Tab aktiv wird
    addRandomBubble();
    
    return () => clearInterval(interval);
  }, [isActive]);
  
  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 10,
        overflow: 'visible',
        pointerEvents: 'none'
      }}
    >
      {bubbles.map(bubble => (
        <Bubble
          key={bubble.id}
          size={bubble.size}
          delay={bubble.delay}
          duration={bubble.duration}
          x={bubble.x}
          shouldReduceMotion={shouldReduceMotion}
        />
      ))}
    </div>
  );
};

BubbleAnimation.propTypes = {
  isActive: PropTypes.bool.isRequired,
  onBurst: PropTypes.bool
};

BubbleAnimation.defaultProps = {
  onBurst: false
};

export default BubbleAnimation; 