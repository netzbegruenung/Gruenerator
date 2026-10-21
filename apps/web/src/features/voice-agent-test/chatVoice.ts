import { type ChatVoice } from '@gruenerator/chat';

import { MistralVoiceAdapter } from './MistralVoiceAdapter';

export const TOOL_LABEL: Record<string, string> = {
  notebook_fragen: 'Suche im Notebook',
  notebook_quellen: 'Lese die Quellen',
  gruenerator_search: 'Durchsuche Programme und Beschlüsse',
  web_search: 'Suche im Netz',
  bundestag: 'Frage beim Bundestag nach',
  abgeordnetenwatch: 'Schaue bei Abgeordnetenwatch',
  umfragen: 'Schaue mir die Umfragen an',
};

let activity: string | null = null;
const listeners = new Set<() => void>();

function setActivity(next: string | null) {
  activity = next;
  for (const listener of listeners) listener();
}

/**
 * Mistral's hosted voice agent in the chat composer. Instance admins only:
 * audio and tool results go to Mistral's global endpoint (see
 * agentSessionController.ts), and the API refuses everyone else.
 */
export const mistralChatVoice: ChatVoice = {
  createAdapter: () =>
    new MistralVoiceAdapter({
      onToolActivity: (call) =>
        setActivity(call ? (TOOL_LABEL[call.name] ?? 'Schlage nach') : null),
      onError: (message) => {
        if (message)
          void import('sonner').then(({ toast }) =>
            toast.error('Sprachgespräch', { description: message })
          );
      },
    }),
  getActivity: () => activity,
  subscribeActivity: (onChange) => {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  },
};
