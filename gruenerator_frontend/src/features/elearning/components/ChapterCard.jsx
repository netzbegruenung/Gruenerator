import React from 'react';
import { motion } from 'motion/react';
import { HiOutlinePlay, HiOutlineClock, HiOutlineBookOpen } from 'react-icons/hi';

const ChapterCard = ({ 
  title, 
  description, 
  duration, 
  difficulty, 
  topics,
  onStartLearning,
  className = '',
  disabled = false 
}) => {
  
  const handleStartLearning = () => {
    if (!disabled && onStartLearning) {
      onStartLearning();
    }
  };

  const getDifficultyColor = (level) => {
    switch (level) {
      case 'Einsteiger': return 'var(--primary-600)';
      case 'Fortgeschritten': return 'var(--secondary-600)';
      case 'Experte': return 'var(--grey-700)';
      default: return 'var(--primary-600)';
    }
  };

  return (
    <motion.div 
      className={`elearning-chapter-card ${className} ${disabled ? 'disabled' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={!disabled ? { 
        y: -4,
        boxShadow: 'var(--card-hover-shadow)'
      } : {}}
      onClick={handleStartLearning}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          handleStartLearning();
        }
      }}
      aria-label={disabled ? undefined : `Kapitel starten: ${title}`}
    >
      <div className="chapter-card-header">
        <div className="chapter-card-icon">
          <HiOutlineBookOpen />
        </div>
        <div className="chapter-card-meta">
          <div className="chapter-duration">
            <HiOutlineClock />
            <span>{duration}</span>
          </div>
          <div 
            className="chapter-difficulty"
            style={{ color: getDifficultyColor(difficulty) }}
          >
            {difficulty}
          </div>
        </div>
      </div>

      <div className="chapter-card-content">
        <h3 className="chapter-card-title">{title}</h3>
        <p className="chapter-card-description">{description}</p>
        
        {topics && topics.length > 0 && (
          <div className="chapter-card-topics">
            {topics.map((topic, index) => (
              <span key={index} className="chapter-topic-tag">
                {topic}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="chapter-card-footer">
        <button 
          className="chapter-start-button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            handleStartLearning();
          }}
        >
          <HiOutlinePlay />
          <span>Lernen starten</span>
        </button>
      </div>
    </motion.div>
  );
};

export default ChapterCard;