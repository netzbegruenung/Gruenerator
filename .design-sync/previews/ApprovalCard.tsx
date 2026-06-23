import { ApprovalCard } from '@gruenerator/ui';

// The interactive approval/decision card: an agent action awaiting Freigabe,
// with title, description, a metadata list and the two decision buttons.
export function FreigabeAusstehend() {
  return (
    <ApprovalCard
      id="freigabe-newsletter"
      icon="send"
      title="Newsletter an 4.812 Mitglieder senden?"
      description="Der Agent „Pressestelle“ möchte den fertigen Juni-Newsletter an den gesamten Verteiler ausspielen."
      metadata={[
        { key: 'Betreff', value: 'Klimaschutz vor Ort stärken' },
        { key: 'Empfänger:innen', value: '4.812' },
        { key: 'Versand', value: 'Sofort nach Freigabe' },
      ]}
      confirmLabel="Senden"
      cancelLabel="Abbrechen"
    />
  );
}

// The destructive variant — a deletion awaiting confirmation.
export function LoeschenBestaetigen() {
  return (
    <ApprovalCard
      id="freigabe-loeschen"
      icon="trash-2"
      variant="destructive"
      title="Kampagne unwiderruflich löschen?"
      description="Die Kampagne „Bürgerdialog Wärmewende“ und alle zugehörigen Entwürfe werden dauerhaft entfernt."
      metadata={[
        { key: 'Kampagne', value: 'Bürgerdialog Wärmewende' },
        { key: 'Entwürfe', value: '7 Beiträge' },
      ]}
      confirmLabel="Endgültig löschen"
      cancelLabel="Abbrechen"
    />
  );
}

// The post-decision receipt state — the choice has been recorded as approved.
export function FreigabeErteilt() {
  return (
    <ApprovalCard
      id="freigabe-erteilt"
      title="Newsletter an 4.812 Mitglieder senden?"
      choice="approved"
    />
  );
}
