import { type NavigateFunction } from 'react-router-dom';

import { type FreitextHandoff } from './freitextHandoff';

/** A written request goes to the creator, which picks the form itself unless the request names one. */
export function openSharepicCreator(navigate: NavigateFunction, prompt: string): void {
  const handoff: FreitextHandoff = { prompt, photos: [] };
  void navigate('/studio/freitext', { state: handoff });
}
