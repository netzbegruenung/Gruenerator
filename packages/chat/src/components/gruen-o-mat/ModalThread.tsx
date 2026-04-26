import { Leaf } from 'lucide-react';

import { CompactThread } from '../modal/CompactThread';
import { CompactWelcome } from '../modal/CompactWelcome';

const DEFAULT_SUGGESTIONS = [
  'Was ist die Position der Grünen zum Klimaschutz?',
  'Was fordern die Grünen im Bereich Bildung?',
  'Welche Positionen gibt es zur Energiewende?',
];

export interface ModalThreadProps {
  suggestions?: string[];
  className?: string;
}

export function ModalThread({ suggestions = DEFAULT_SUGGESTIONS, className }: ModalThreadProps) {
  return (
    <CompactThread
      className={className}
      assistantIcon={<Leaf className="size-4 text-primary" />}
      welcome={
        <CompactWelcome
          icon={<Leaf className="size-6 text-primary" />}
          description="Stell eine Frage zu grüner Politik"
          suggestions={suggestions}
        />
      }
    />
  );
}
