import { motion } from 'motion/react';

import { cn } from '../../../utils/cn';

interface ProfileTabSkeletonProps {
  type?: 'default' | 'list' | 'form' | 'tabs';
  itemCount?: number;
}

const shimmer = {
  initial: {
    backgroundPosition: '-500px 0',
  },
  animate: {
    backgroundPosition: '500px 0',
    transition: {
      repeat: Infinity,
      duration: 1.5,
      ease: 'linear',
    },
  },
} as const;

const shimmerBg =
  'bg-[linear-gradient(90deg,var(--background-color-alt)_0%,var(--background-color)_20%,var(--background-color-alt)_40%)] bg-[length:1000px_100%]';

const ProfileTabSkeleton = ({ type = 'default', itemCount = 3 }: ProfileTabSkeletonProps) => {
  const renderSkeleton = () => {
    switch (type) {
      case 'list':
        return (
          <div>
            {Array(itemCount)
              .fill(null)
              .map((_, index) => (
                <motion.div
                  key={index}
                  className={cn(shimmerBg, 'flex justify-between p-md rounded-xxs mb-sm items-center')}
                  variants={shimmer}
                  initial="initial"
                  animate="animate"
                >
                  <div className="flex-1">
                    <div className="h-6 w-3/5 mb-sm bg-background-alt rounded-xxs" />
                    <div className="h-3.5 w-2/5 bg-background-alt rounded-xxs" />
                  </div>
                  <div className="flex gap-sm">
                    <div className="w-8 h-8 rounded-full bg-background-alt" />
                  </div>
                </motion.div>
              ))}
          </div>
        );
      case 'form':
        return (
          <div>
            <motion.div
              className={cn(shimmerBg, 'h-8 w-1/2 mb-lg rounded-xxs')}
              variants={shimmer}
              initial="initial"
              animate="animate"
            />
            {Array(4)
              .fill(null)
              .map((_, index) => (
                <div key={index} className="mb-md">
                  <motion.div
                    className={cn(shimmerBg, 'h-4 w-[30%] mb-sm rounded-xxs')}
                    variants={shimmer}
                    initial="initial"
                    animate="animate"
                  />
                  <motion.div
                    className={cn(shimmerBg, 'h-10 w-full rounded-xxs')}
                    variants={shimmer}
                    initial="initial"
                    animate="animate"
                  />
                </div>
              ))}
            <div className="mt-lg flex justify-end">
              <motion.div
                className={cn(shimmerBg, 'h-10 w-40 rounded-xxs')}
                variants={shimmer}
                initial="initial"
                animate="animate"
              />
            </div>
          </div>
        );
      case 'tabs':
        return (
          <div className="flex flex-col">
            <div className="flex gap-sm mb-md">
              {Array(3)
                .fill(null)
                .map((_, index) => (
                  <motion.div
                    key={index}
                    className={cn(shimmerBg, 'h-10 w-32 rounded-xxs')}
                    variants={shimmer}
                    initial="initial"
                    animate="animate"
                  />
                ))}
            </div>
            <div>
              <motion.div
                className={cn(shimmerBg, 'h-80 w-full rounded-xxs')}
                variants={shimmer}
                initial="initial"
                animate="animate"
              />
            </div>
          </div>
        );
      default:
        return (
          <div>
            <motion.div
              className={cn(shimmerBg, 'h-10 w-3/5 mb-lg rounded-xxs max-md:w-4/5')}
              variants={shimmer}
              initial="initial"
              animate="animate"
            />
            <div>
              {Array(itemCount)
                .fill(null)
                .map((_, index) => (
                  <motion.div
                    key={index}
                    className={cn(
                      shimmerBg,
                      'h-5 mb-md rounded-xxs',
                      index === 0 && 'w-full',
                      index === 1 && 'w-[90%]',
                      index === 2 && 'w-3/4',
                      index > 2 && 'w-4/5'
                    )}
                    variants={shimmer}
                    initial="initial"
                    animate="animate"
                  />
                ))}
            </div>
          </div>
        );
    }
  };

  return <div className="w-full p-md">{renderSkeleton()}</div>;
};

export default ProfileTabSkeleton;
