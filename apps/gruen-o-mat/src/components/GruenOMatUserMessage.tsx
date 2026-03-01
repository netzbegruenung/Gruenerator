import { useMessage } from '@assistant-ui/react';
import { memo } from 'react';

function GruenOMatUserMessageInner() {
  const message = useMessage();

  const text = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  return (
    <div className="flex w-full justify-end py-4">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-user-bubble px-4 py-2.5 text-sm">
        {text}
      </div>
    </div>
  );
}

export const GruenOMatUserMessage = memo(GruenOMatUserMessageInner);
