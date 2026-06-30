import { NotificationBell, TooltipProvider } from '@gruenerator/ui';

// A small placeholder panel — only shown once the popover is opened by a user.
const Panel = () => (
  <div style={{ padding: 16, width: 320 }}>
    <strong style={{ fontSize: 14 }}>Benachrichtigungen</strong>
    <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
      Neue Antwort auf deinen Antrag „Klimaschutz vor Ort“.
    </p>
  </div>
);

// The bell trigger with an unread-count badge — the resting state in the header.
// NotificationBell uses Radix Tooltip internally, which needs a TooltipProvider
// ancestor (the consuming app supplies it at the root); wrap the cell in one.
export function WithUnread() {
  return (
    <TooltipProvider>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: 8 }}>
        <NotificationBell unreadCount={3}>
          <Panel />
        </NotificationBell>
        <NotificationBell unreadCount={12}>
          <Panel />
        </NotificationBell>
        <NotificationBell unreadCount={128}>
          <Panel />
        </NotificationBell>
      </div>
    </TooltipProvider>
  );
}

// No unread notifications — bell without the badge.
export function Empty() {
  return (
    <TooltipProvider>
      <div style={{ display: 'flex', padding: 8 }}>
        <NotificationBell unreadCount={0}>
          <Panel />
        </NotificationBell>
      </div>
    </TooltipProvider>
  );
}
