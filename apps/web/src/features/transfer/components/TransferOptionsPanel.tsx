import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@gruenerator/ui';
import { PiLock, PiTimer } from 'react-icons/pi';

export type ExpiryOption = '1' | '7' | '30' | 'none';

interface TransferOptionsPanelProps {
  expiryDays: ExpiryOption;
  onExpiryChange: (value: ExpiryOption) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  passwordEnabled: boolean;
  onPasswordToggle: (enabled: boolean) => void;
  message: string;
  onMessageChange: (value: string) => void;
}

const EXPIRY_OPTIONS: Array<{ value: ExpiryOption; label: string }> = [
  { value: '1', label: '1 Tag' },
  { value: '7', label: '7 Tage' },
  { value: '30', label: '30 Tage' },
  { value: 'none', label: 'Kein Limit' },
];

export default function TransferOptionsPanel({
  expiryDays,
  onExpiryChange,
  password,
  onPasswordChange,
  passwordEnabled,
  onPasswordToggle,
  message,
  onMessageChange,
}: TransferOptionsPanelProps) {
  return (
    <div className="flex flex-col gap-md rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
      <div className="flex items-center gap-sm">
        <PiTimer className="size-4 text-grey-400" />
        <Label className="flex-1 text-sm font-medium">Gültigkeitsdauer</Label>
        <Select value={expiryDays} onValueChange={(v) => onExpiryChange(v as ExpiryOption)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPIRY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-sm">
        <div className="flex items-center gap-sm">
          <PiLock className="size-4 text-grey-400" />
          <Label className="flex-1 text-sm font-medium">Passwortschutz</Label>
          <Switch checked={passwordEnabled} onCheckedChange={onPasswordToggle} />
        </div>
        {passwordEnabled && (
          <Input
            type="password"
            placeholder="Passwort eingeben"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="text-sm"
          />
        )}
      </div>

      <div className="flex flex-col gap-xs">
        <Label className="text-sm font-medium text-grey-400">Nachricht (optional)</Label>
        <Textarea
          placeholder="Nachricht für Empfänger*in..."
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          rows={2}
          className="resize-none text-sm"
        />
      </div>
    </div>
  );
}
