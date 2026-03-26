import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@gruenerator/ui';
import React, { memo } from 'react';

import { MODE_MAP, type ModeState, type ModeDefinition } from '../modes';

interface ModeExtraFieldsProps {
  mode: string;
  state: ModeState;
  onChange: (key: string, value: string | string[]) => void;
  def?: ModeDefinition;
}

const ModeExtraFields: React.FC<ModeExtraFieldsProps> = memo(
  ({ mode, state, onChange, def: defProp }) => {
    const def = defProp ?? MODE_MAP[mode];
    if (!def?.extraFields) return null;

    const visibleFields = def.extraFields.filter((f) => !f.condition || f.condition(state));

    if (visibleFields.length === 0) return null;

    return (
      <div className="flex flex-col gap-sm">
        {visibleFields.map((field) => {
          const fieldEl =
            field.type === 'select' && field.options ? (
              <Select
                value={(state[field.key] as string) ?? ''}
                onValueChange={(val) => onChange(field.key, val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={field.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === 'textarea' ? (
              <Textarea
                value={(state[field.key] as string) ?? ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="min-h-20"
              />
            ) : (
              <Input
                value={(state[field.key] as string) ?? ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            );

          if (!field.label) return <React.Fragment key={field.key}>{fieldEl}</React.Fragment>;

          return (
            <div key={field.key} className="flex flex-col gap-xs">
              <Label>
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {fieldEl}
            </div>
          );
        })}
      </div>
    );
  }
);

ModeExtraFields.displayName = 'ModeExtraFields';

export default ModeExtraFields;
