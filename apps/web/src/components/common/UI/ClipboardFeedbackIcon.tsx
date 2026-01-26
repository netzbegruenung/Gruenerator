import { motion, AnimatePresence } from 'motion/react';
import { FaCheck } from 'react-icons/fa';
import { HiOutlineClipboardCopy } from 'react-icons/hi';

interface ClipboardFeedbackIconProps {
  copied: boolean;
  iconSize?: number;
}

const ClipboardFeedbackIcon = ({ copied, iconSize = 18 }: ClipboardFeedbackIconProps) => {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {copied ? (
        <motion.div
          key="check"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <FaCheck size={iconSize} />
        </motion.div>
      ) : (
        <motion.div
          key="clipboard"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <HiOutlineClipboardCopy size={iconSize} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ClipboardFeedbackIcon;
