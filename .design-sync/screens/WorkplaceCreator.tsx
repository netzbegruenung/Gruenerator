import { PillGroup, AIPromptInput } from '../../packages/ui/src/index';

import { PlusIcon } from './icons';

// Recreation of the workplace CreatorSection: a centered mode-pill row
// (ModePillRow) above the chat-style composer (ChatInner → AIPromptInput).
const MODE_CONFIG = {
  key: 'mode',
  label: 'Modus',
  multiple: false,
  options: [
    { id: 'chat', label: 'Chat' },
    { id: 'texte', label: 'Texte' },
    { id: 'bilder', label: 'Bilder' },
    { id: 'boards', label: 'Boards' },
    { id: 'docs', label: 'Docs' },
  ],
};

const EXAMPLES = [
  { label: 'Pressemitteilung', text: 'Schreibe eine Pressemitteilung zu ' },
  { label: 'Rede', text: 'Entwirf eine Rede über ' },
  { label: 'Antrag', text: 'Formuliere einen Antrag zur ' },
];

const Toolbar = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      color: 'var(--muted-foreground, #71717a)',
    }}
  >
    <PlusIcon />
  </div>
);

export function WorkplaceCreator() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 768,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PillGroup config={MODE_CONFIG} value="chat" onChange={() => {}} />
      </div>
      <AIPromptInput
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        placeholder="Was stricken wir heute?"
        toolbar={<Toolbar />}
        examples={EXAMPLES}
      />
    </div>
  );
}
