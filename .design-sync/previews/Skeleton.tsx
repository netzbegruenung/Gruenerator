import { Skeleton } from '@gruenerator/ui';

// A card-shaped loading placeholder: avatar circle + title and meta lines —
// the shape used while a Pressemitteilung loads.
export function CardSkeleton() {
  return (
    <div style={{ width: 360, padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Skeleton style={{ height: 40, width: 40, borderRadius: '50%' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <Skeleton style={{ height: 14, width: '60%' }} />
          <Skeleton style={{ height: 12, width: '40%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <Skeleton style={{ height: 12, width: '100%' }} />
        <Skeleton style={{ height: 12, width: '92%' }} />
        <Skeleton style={{ height: 12, width: '75%' }} />
      </div>
    </div>
  );
}

// A list of loading rows — the placeholder for a Mitglieder- or
// Anträge-Tabelle that is still fetching.
export function ListSkeleton() {
  return (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton style={{ height: 32, width: 32, borderRadius: '50%' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <Skeleton style={{ height: 12, width: '70%' }} />
            <Skeleton style={{ height: 10, width: '45%' }} />
          </div>
          <Skeleton style={{ height: 20, width: 64, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}
