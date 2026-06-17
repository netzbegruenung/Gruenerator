import { Input } from '@gruenerator/ui';
import { memo, useState } from 'react';

interface GeneralSectionProps {
  boardTitle: string;
  description: string;
  onRename: (title: string) => void;
  onSaveDescription: (value: string) => void;
}

/** Board name + description — the spacious version of the cramped sidebar field. */
export const GeneralSection = memo(function GeneralSection({
  boardTitle,
  description,
  onRename,
  onSaveDescription,
}: GeneralSectionProps) {
  const [name, setName] = useState(boardTitle);
  const [desc, setDesc] = useState(description);

  return (
    <section className="flex w-full max-w-[42rem] flex-col gap-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">Allgemein</h2>
        <p className="mt-0.5 text-sm text-grey-500">Name und Beschreibung dieses Boards.</p>
      </div>

      <label className="flex flex-col gap-xs text-sm font-medium text-foreground">
        Name
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (v && v !== boardTitle) onRename(v);
          }}
          placeholder="Board-Name"
        />
      </label>

      <label className="flex flex-col gap-xs text-sm font-medium text-foreground">
        Beschreibung
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => {
            if (desc !== description) onSaveDescription(desc);
          }}
          placeholder="Worum geht es in diesem Board? (Markdown)"
          rows={6}
          className="w-full resize-y rounded-md border border-grey-200 bg-transparent px-3 py-2 text-sm font-normal outline-none focus:border-primary-500 dark:border-grey-700"
        />
      </label>
    </section>
  );
});
