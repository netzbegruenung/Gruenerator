import React from 'react';
import { motion } from "motion/react";
import '../../../assets/styles/components/ui/profile-skeleton.css';

const ProfileTabSkeleton = ({ type = 'default', itemCount = 3 }) => {
  // Gemeinsamer Shimmer-Effekt für alle Skeleton-Elemente
  const shimmer = {
    initial: {
      backgroundPosition: '-500px 0',
    },
    animate: {
      backgroundPosition: '500px 0',
      transition: {
        repeat: Infinity,
        duration: 1.5,
        ease: "linear"
      }
    }
  };

  // Verschiedene Skeletons basierend auf dem Typ
  const renderSkeleton = () => {
    switch (type) {
      case 'list':
        return (
          <div className="profile-skeleton-list">
            {Array(itemCount).fill().map((_, index) => (
              <motion.div 
                key={index} 
                className="profile-skeleton-list-item"
                variants={shimmer}
                initial="initial"
                animate="animate"
              >
                <div className="profile-skeleton-item-content">
                  <div className="profile-skeleton-title"></div>
                  <div className="profile-skeleton-meta"></div>
                </div>
                <div className="profile-skeleton-actions">
                  <div className="profile-skeleton-button"></div>
                </div>
              </motion.div>
            ))}
          </div>
        );
      case 'form':
        return (
          <div className="profile-skeleton-form">
            <motion.div 
              className="profile-skeleton-form-title"
              variants={shimmer}
              initial="initial"
              animate="animate"
            ></motion.div>
            {Array(4).fill().map((_, index) => (
              <div key={index} className="profile-skeleton-form-group">
                <motion.div 
                  className="profile-skeleton-label"
                  variants={shimmer}
                  initial="initial"
                  animate="animate"
                ></motion.div>
                <motion.div 
                  className="profile-skeleton-input"
                  variants={shimmer}
                  initial="initial"
                  animate="animate"
                ></motion.div>
              </div>
            ))}
            <div className="profile-skeleton-form-actions">
              <motion.div 
                className="profile-skeleton-button-primary"
                variants={shimmer}
                initial="initial"
                animate="animate"
              ></motion.div>
            </div>
          </div>
        );
      case 'tabs':
        return (
          <div className="profile-skeleton-tabs">
            <div className="profile-skeleton-tabs-navigation">
              {Array(3).fill().map((_, index) => (
                <motion.div 
                  key={index} 
                  className="profile-skeleton-tab"
                  variants={shimmer}
                  initial="initial"
                  animate="animate"
                ></motion.div>
              ))}
            </div>
            <div className="profile-skeleton-tabs-content">
              <motion.div 
                className="profile-skeleton-tabs-panel"
                variants={shimmer}
                initial="initial"
                animate="animate"
              ></motion.div>
            </div>
          </div>
        );
      default:
        return (
          <div className="profile-skeleton-default">
            <motion.div 
              className="profile-skeleton-header"
              variants={shimmer}
              initial="initial"
              animate="animate"
            ></motion.div>
            <div className="profile-skeleton-content">
              {Array(itemCount).fill().map((_, index) => (
                <motion.div 
                  key={index} 
                  className="profile-skeleton-block"
                  variants={shimmer}
                  initial="initial"
                  animate="animate"
                ></motion.div>
              ))}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="profile-skeleton-container">
      {renderSkeleton()}
    </div>
  );
};

export default ProfileTabSkeleton; 