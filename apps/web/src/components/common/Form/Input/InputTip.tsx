import { motion, AnimatePresence } from 'motion/react';
import './InputTip.css';

export interface Tip {
  icon?: string;
  text: string;
}

export interface InputTipProps {
  tip?: Tip | null;
  show?: boolean;
}

const InputTip = ({ tip, show = true }: InputTipProps) => {
  if (!tip) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="input-tip"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {tip.icon && <span className="input-tip__icon">{tip.icon}</span>}
          <span className="input-tip__text">{tip.text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InputTip;
