import { Switch, Label } from '@gruenerator/ui';

// Switch is a Radix toggle: checked / defaultChecked / disabled, size sm|default.

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 };

// On / off / disabled — the core state axis (checked = Eucalyptus green track).
export function States() {
  return (
    <div style={col}>
      <div style={row}>
        <Switch id="sw-on" defaultChecked />
        <Label htmlFor="sw-on">Kampagne veröffentlicht</Label>
      </div>
      <div style={row}>
        <Switch id="sw-off" />
        <Label htmlFor="sw-off">Entwurf, noch nicht sichtbar</Label>
      </div>
      <div style={row}>
        <Switch id="sw-disabled" disabled defaultChecked />
        <Label htmlFor="sw-disabled">Von der Basis (gesperrt)</Label>
      </div>
    </div>
  );
}

// Settings-row pattern — Label left, Switch right, both sizes.
export function SettingsRows() {
  return (
    <div style={{ ...col, maxWidth: 320 }}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <Label htmlFor="ng-push">Push-Benachrichtigungen</Label>
        <Switch id="ng-push" defaultChecked />
      </div>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <Label htmlFor="ng-mail">Wöchentliche Zusammenfassung</Label>
        <Switch id="ng-mail" size="sm" defaultChecked />
      </div>
    </div>
  );
}
