import { motion, AnimatePresence } from 'motion/react';

import { cn } from '../../../../utils/cn';

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
          className={cn(
            'flex items-center gap-xs px-sm py-xs mt-xs',
            'text-sm max-md:text-xs max-md:px-xs max-md:py-xxs',
            'text-grey-400 bg-background-alt rounded-sm',
            'border-l-[3px] border-l-[var(--klee)]'
          )}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {tip.icon && <span className="shrink-0 text-[1em]">{tip.icon}</span>}
          <span className="leading-snug">{tip.text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InputTip;
