import { Collapsible, CollapsibleTrigger, CollapsibleContent, Button } from '@gruenerator/ui';

const Chevron = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// Raw Radix primitive (unstyled by design): open state, with a styled trigger
// row and a list of revealed items as realistic content.
export function TeamMembers() {
  return (
    <div style={{ maxWidth: 420 }}>
      <Collapsible open>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>Aktive Mitglieder · 5</span>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Liste einklappen">
              <Chevron />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul
            style={{
              listStyle: 'none',
              margin: '8px 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {[
              'Anna Berger · Sprecherin',
              'Mehmet Yılmaz · Pressereferent',
              'Lena Hofmann · Kampagnenleitung',
              'Jonas Krause · Social Media',
              'Sofia Marković · Mitgliederbetreuung',
            ].map((name) => (
              <li
                key={name}
                style={{
                  fontSize: 13,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                {name}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
