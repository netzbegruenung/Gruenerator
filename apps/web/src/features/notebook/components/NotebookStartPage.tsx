import { useComposerRuntime } from '@assistant-ui/react';
import { motion } from 'motion/react';

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
      className="chat-start-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="chat-start-page-content">
        <motion.h1
          className="chat-start-page-title"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {title}
        </motion.h1>

        {exampleQuestions.length > 0 && (
          <motion.div
            className="chat-start-page-examples"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                type="button"
                className="chat-start-page-example"
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
