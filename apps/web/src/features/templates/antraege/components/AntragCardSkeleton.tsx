import { motion, type HTMLMotionProps } from "motion/react";

const AntragCardSkeleton = () => {
  // Animation for pulsing effect
  const pulseAnimation: Partial<HTMLMotionProps<"div">> = {
    initial: { opacity: 0.3 },
    animate: { opacity: 0.7 },
    transition: {
      duration: 1.2,
      repeat: Infinity,
      repeatType: "reverse",
      ease: "easeInOut"
    }
  };

  return (
    <div className="gallery-item-card antrag-card antrag-card-skeleton">
      <div>
        {/* Skeleton for Title */}
        <motion.div
          className="skeleton-line skeleton-title"
          {...pulseAnimation}
          style={{
            height: '24px',
            width: '80%',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            marginBottom: '12px'
          }}
        />

        {/* Skeleton for Description */}
        <motion.div
          className="skeleton-line skeleton-description"
          {...pulseAnimation}
          style={{
            height: '16px',
            width: '95%',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            marginBottom: '8px'
          }}
        />

        <motion.div
          className="skeleton-line skeleton-description-2"
          {...pulseAnimation}
          style={{
            height: '16px',
            width: '70%',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            marginBottom: '16px'
          }}
        />

        {/* Skeleton for Tags */}
        <div className="antrag-card-tags">
          <motion.div
            className="skeleton-tag"
            {...pulseAnimation}
            style={{
              height: '20px',
              width: '60px',
              backgroundColor: '#e2e8f0',
              borderRadius: '12px',
              display: 'inline-block',
              marginRight: '8px'
            }}
          />
          <motion.div
            className="skeleton-tag"
            {...pulseAnimation}
            style={{
              height: '20px',
              width: '50px',
              backgroundColor: '#e2e8f0',
              borderRadius: '12px',
              display: 'inline-block',
              marginRight: '8px'
            }}
          />
          <motion.div
            className="skeleton-tag"
            {...pulseAnimation}
            style={{
              height: '20px',
              width: '70px',
              backgroundColor: '#e2e8f0',
              borderRadius: '12px',
              display: 'inline-block'
            }}
          />
        </div>
      </div>

      {/* Skeleton for Date */}
      <motion.div
        className="skeleton-line skeleton-date"
        {...pulseAnimation}
        style={{
          height: '14px',
          width: '120px',
          backgroundColor: '#e2e8f0',
          borderRadius: '4px',
          marginTop: '16px'
        }}
      />
    </div>
  );
};

export default AntragCardSkeleton;
