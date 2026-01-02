import React from 'react';
import { LazyMotion, m, AnimatePresence } from 'motion/react';

import '../../../../assets/styles/components/actions/slogan-alternatives.css';

const loadFeatures = () => import('motion/react').then(res => res.domAnimation);

export const SloganAlternativesDisplay = ({
  currentSlogan,
  alternatives,
  onSloganSelect
}) => {
  if (!alternatives || alternatives.length === 0) return null;

  const renderContent = (item, isHero = false) => {
    const className = isHero ? 'slogan-content slogan-content--hero' : 'slogan-content';

    if (item.quote) {
      return (
        <div className={className}>
          <p>{item.quote}</p>
        </div>
      );
    }
    if (item.header || item.subheader || item.body) {
      return (
        <div className={className}>
          {item.header && <p className="slogan-content__header">{item.header}</p>}
          {item.subheader && <p className="slogan-content__subheader">{item.subheader}</p>}
          {item.body && <p className="slogan-content__body">{item.body}</p>}
        </div>
      );
    }
    return (
      <div className={className}>
        {item.line1 && <p>{item.line1}</p>}
        {item.line2 && <p>{item.line2}</p>}
        {item.line3 && <p>{item.line3}</p>}
      </div>
    );
  };

  return (
    <LazyMotion features={loadFeatures}>
      <div className="slogan-selector">
        <AnimatePresence mode="wait">
          <m.div
            key={JSON.stringify(currentSlogan)}
            className="slogan-hero"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {renderContent(currentSlogan, true)}
          </m.div>
        </AnimatePresence>

        <div className="slogan-alternatives-row">
          {alternatives.map((item, index) => (
            <m.button
              key={index}
              type="button"
              className="slogan-alternative"
              onClick={() => onSloganSelect(item)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              {renderContent(item)}
            </m.button>
          ))}
        </div>
      </div>
    </LazyMotion>
  );
};

