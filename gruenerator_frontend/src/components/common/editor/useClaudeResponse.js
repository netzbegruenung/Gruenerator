import { useContext } from 'react';
import { FormContext } from '../../utils/FormContext';
import useApiSubmit from '../../hooks/useApiSubmit';

export const useClaudeResponse = () => {
  const { handleAiResponse } = useContext(FormContext);
  const { submitForm } = useApiSubmit('/claude_chat');

  const processClaudeRequest = async (message, value, cursorPosition, selectedRange, quill) => {
    const response = await submitForm({
      message,
      currentText: value,
      cursorPosition,
      selectedText: selectedRange && selectedRange.length > 0 ? 
        quill?.getText(selectedRange?.index ?? 0, selectedRange?.length ?? 0) : null
    });

    await handleAiResponse(response);
    return response.response;
  };

  return { processClaudeRequest };
}; 