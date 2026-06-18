import { Link } from 'react-router-dom';

import { AI_TRANSPARENCY, KI_TRANSPARENZ_PATH } from '../../config/aiTransparency';

/**
 * Dezenter KI-Hinweis für Prompt-Eingabebereiche (Text-Generatoren).
 * Wird z. B. an den `footer`-Slot von `AIPromptInput` übergeben.
 */
export const AITransparencyHint = () => (
  <p className="text-xs text-grey-400 text-center max-w-prose">
    {AI_TRANSPARENCY.inputHint}{' '}
    <Link to={KI_TRANSPARENZ_PATH} className="underline hover:text-grey-600">
      {AI_TRANSPARENCY.inputHintLink}
    </Link>
  </p>
);

export default AITransparencyHint;
