export interface ChannelPreferences {
  email: boolean;
  push: boolean;
  in_app: boolean;
}

export type NotificationChannel = 'email' | 'push' | 'in_app';

export const CHANNEL_META: Record<NotificationChannel, { label: string; shortLabel: string }> = {
  in_app: { label: 'In-App', shortLabel: 'App' },
  email: { label: 'E-Mail', shortLabel: 'Mail' },
  push: { label: 'Push', shortLabel: 'Push' },
};

// 'push' is deliberately absent: push notifications were removed, so the
// toggle would promise a delivery that never happens. The channel itself stays
// in the type and in the contract enum — stored preferences still carry it.
export const CHANNEL_ORDER: NotificationChannel[] = ['in_app', 'email'];
