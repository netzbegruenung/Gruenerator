import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  Badge,
  Avatar,
  AvatarFallback,
} from '@gruenerator/ui';

// A list of Anträge with status badges — the canonical data table:
// header row, body rows, hover state, and a footer summary.
export function AntraegeTable() {
  const rows = [
    { id: 'A-2026-014', titel: 'Kommunaler Wärmeplan beschließen', gremium: 'Ortsverband Mitte', status: 'Veröffentlicht', variant: 'default' as const },
    { id: 'A-2026-017', titel: 'Radwegenetz Innenstadt ausbauen', gremium: 'Fraktion', status: 'In Prüfung', variant: 'secondary' as const },
    { id: 'A-2026-021', titel: 'Förderung für Dachbegrünung', gremium: 'AG Klima', status: 'Entwurf', variant: 'outline' as const },
    { id: 'A-2026-009', titel: 'Tempo 30 vor Schulen', gremium: 'Kreisverband', status: 'Abgelehnt', variant: 'destructive' as const },
  ];
  return (
    <Table>
      <TableCaption>Anträge der laufenden Sitzungsperiode</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Nummer</TableHead>
          <TableHead>Titel</TableHead>
          <TableHead>Gremium</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>{r.id}</TableCell>
            <TableCell style={{ fontWeight: 600 }}>{r.titel}</TableCell>
            <TableCell>{r.gremium}</TableCell>
            <TableCell>
              <Badge variant={r.variant}>{r.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Gesamt</TableCell>
          <TableCell>4 Anträge</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

// A Mitglieder roster — avatars + role, showing a row that mixes
// media (Avatar), text columns and a selected row state.
export function MitgliederTable() {
  const members = [
    { name: 'Carla Brenner', initials: 'CB', rolle: 'Sprecherin', ortsverband: 'Nord', selected: true },
    { name: 'Jonas Felden', initials: 'JF', rolle: 'Schatzmeister', ortsverband: 'Mitte', selected: false },
    { name: 'Marie Lautenbach', initials: 'ML', rolle: 'Beisitzerin', ortsverband: 'West', selected: false },
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mitglied</TableHead>
          <TableHead>Funktion</TableHead>
          <TableHead>Ortsverband</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.name} data-state={m.selected ? 'selected' : undefined}>
            <TableCell>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar size="sm">
                  <AvatarFallback>{m.initials}</AvatarFallback>
                </Avatar>
                <span style={{ fontWeight: 600 }}>{m.name}</span>
              </div>
            </TableCell>
            <TableCell>{m.rolle}</TableCell>
            <TableCell>{m.ortsverband}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
