import { Bell, ExternalLink, SmilePlus } from 'lucide-react';

import { NOTIFICATION_TYPES } from './types';

import type { NotificationGroup } from './types';
import type { ComponentType } from 'react';

// ── Types ────────────────────────────────────────────────────────────

export const MAX_BODY_LENGTH = 120;
export const MAX_ACTIONS = 2;
export const MAX_ACTION_LABEL_LENGTH = 20;

export interface NotificationAction {
  label: string;
  icon: ComponentType<{ className?: string }>;
  run: (ctx: NotificationActionContext) => void;
}

export interface NotificationActionContext {
  notification: { id: string; action_url: string | null; metadata: Record<string, unknown> };
  navigate: (path: string) => void;
  markAsRead: (id: string) => void;
  refreshProfile: () => void;
}

export interface NotificationTypeConfig {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  image?: string;
  group?: NotificationGroup;
  actions?: (ctx: NotificationActionContext) => (NotificationAction | null)[];
}

// ── Shared action builders ───────────────────────────────────────────
// Composable factories — each returns a function that takes ctx and produces an action (or null).
// Use in notification type configs: actions: (ctx) => [openLinkAction('Öffnen')(ctx), setAvatarAction(10)(ctx)]

export function openLinkAction(label = 'Öffnen') {
  return (ctx: NotificationActionContext): NotificationAction | null => {
    if (!ctx.notification.action_url) return null;
    return {
      label,
      icon: ExternalLink,
      run: (c) => {
        c.markAsRead(c.notification.id);
        c.navigate(c.notification.action_url!);
      },
    };
  };
}

export function setAvatarAction(avatarId: number, label = 'Avatar aktivieren') {
  return (_ctx: NotificationActionContext): NotificationAction => ({
    label,
    icon: SmilePlus,
    run: async (c) => {
      c.markAsRead(c.notification.id);
      const { profileApiService } = await import('../auth/services/profileApiService');
      await profileApiService.updateAvatar(avatarId);
      c.refreshProfile();
    },
  });
}

export function navigateAction(
  path: string,
  label: string,
  icon: ComponentType<{ className?: string }> = ExternalLink
) {
  return (_ctx: NotificationActionContext): NotificationAction => ({
    label,
    icon,
    run: (c) => {
      c.markAsRead(c.notification.id);
      c.navigate(path);
    },
  });
}

// ── Lookup helpers ───────────────────────────────────────────────────

const DEFAULT_CONFIG: NotificationTypeConfig = {
  label: 'Benachrichtigung',
  description: '',
  icon: Bell,
};

export function getNotificationConfig(type: string): NotificationTypeConfig {
  return NOTIFICATION_TYPES[type] ?? DEFAULT_CONFIG;
}

export function getNotificationActions(
  type: string,
  ctx: NotificationActionContext
): NotificationAction[] {
  const config = NOTIFICATION_TYPES[type];
  return ((config?.actions?.(ctx) ?? []).filter(Boolean) as NotificationAction[]).slice(
    0,
    MAX_ACTIONS
  );
}

export function getEmailPreferenceTypes() {
  return getAllPreferenceTypes();
}

export function getAllPreferenceTypes() {
  return Object.entries(NOTIFICATION_TYPES).map(([key, config]) => ({ key, ...config }));
}

export function getPreferenceTypesByGroup() {
  const all = getAllPreferenceTypes();
  const grouped = new Map<string, typeof all>();

  for (const entry of all) {
    const group = entry.group ?? 'system';
    const existing = grouped.get(group) ?? [];
    existing.push(entry);
    grouped.set(group, existing);
  }

  return grouped;
}

export function truncateBody(body: string | null | undefined): string | null {
  if (!body) return null;
  if (body.length <= MAX_BODY_LENGTH) return body;
  return body.slice(0, MAX_BODY_LENGTH - 1) + '…';
}
