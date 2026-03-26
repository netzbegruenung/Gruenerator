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

export const CHANNEL_ORDER: NotificationChannel[] = ['in_app', 'email', 'push'];
