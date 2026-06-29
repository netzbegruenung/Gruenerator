import { Tabs, TabsList, TabsTrigger, TabsContent } from '@gruenerator/ui';

const panel: React.CSSProperties = {
  padding: 16,
  lineHeight: 1.6,
  fontSize: 14,
};

// The canonical default Tabs: a segmented control (TabsList) over content panels.
// One TabsList of three triggers + matching panels, with `defaultValue` set so the
// first tab renders active in the static card.
export function NewsletterTabs() {
  return (
    <div style={{ maxWidth: 460 }}>
      <Tabs defaultValue="inhalt">
        <TabsList>
          <TabsTrigger value="inhalt">Inhalt</TabsTrigger>
          <TabsTrigger value="empfaenger">Empfänger:innen</TabsTrigger>
          <TabsTrigger value="versand">Versand</TabsTrigger>
        </TabsList>
        <TabsContent value="inhalt" style={panel}>
          Drei Themenblöcke im Entwurf: Klimaschutz vor Ort, Mitgliederversammlung
          und der Rückblick auf den Kreisparteitag.
        </TabsContent>
        <TabsContent value="empfaenger" style={panel}>
          4.812 Empfänger:innen im Verteiler „Aktive Mitglieder“.
        </TabsContent>
        <TabsContent value="versand" style={panel}>
          Geplant für Montag, 23. Juni 2026 um 09:00 Uhr.
        </TabsContent>
      </Tabs>
    </div>
  );
}

// The `line` variant of TabsList — underline tabs instead of the filled segment.
export function LineTabs() {
  return (
    <div style={{ maxWidth: 460 }}>
      <Tabs defaultValue="entwurf">
        <TabsList variant="line">
          <TabsTrigger value="entwurf">Entwurf</TabsTrigger>
          <TabsTrigger value="geplant">Geplant</TabsTrigger>
          <TabsTrigger value="veroeffentlicht">Veröffentlicht</TabsTrigger>
        </TabsList>
        <TabsContent value="entwurf" style={panel}>
          Pressemitteilung „Wärmewende kommunal denken“ wartet auf Freigabe.
        </TabsContent>
        <TabsContent value="geplant" style={panel}>
          Zwei Beiträge für den Wahlkampf-Kanal sind terminiert.
        </TabsContent>
        <TabsContent value="veroeffentlicht" style={panel}>
          14 Mitteilungen seit Jahresbeginn veröffentlicht.
        </TabsContent>
      </Tabs>
    </div>
  );
}
