import { useComposerRuntime } from '@assistant-ui/react';
import { motion } from 'motion/react';

import { cn } from '@/utils/cn';

interface ExampleQuestion {
  icon?: string;
  text?: string;
}

interface NotebookStartPageProps {
  title: string;
  exampleQuestions?: ExampleQuestion[];
}

export function NotebookStartPage({ title, exampleQuestions = [] }: NotebookStartPageProps) {
  const composerRuntime = useComposerRuntime();

  const handleExampleClick = (text: string | undefined) => {
    if (text) {
      composerRuntime.setText(text);
      composerRuntime.send();
    }
  };

  return (
    <motion.div
      className="flex min-h-full flex-1 flex-col items-center justify-center p-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex w-full max-w-[680px] flex-col items-center gap-xl">
        <motion.h1
          className="m-0 text-center text-[2rem] font-semibold leading-tight text-foreground-heading"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {title}
        </motion.h1>

        {exampleQuestions.length > 0 && (
          <motion.div
            className="flex flex-wrap justify-center gap-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                type="button"
                className={cn(
                  'flex items-center gap-2 rounded-[18px] px-4 py-2 text-sm',
                  'bg-background-alt text-foreground',
                  'transition-all hover:-translate-y-0.5 hover:bg-hover-overlay',
                  'active:translate-y-0'
                )}
                onClick={() => handleExampleClick(question.text)}
              >
                <span>{question.icon}</span>
                <span>{question.text}</span>
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
