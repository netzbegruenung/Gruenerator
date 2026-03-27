import { Bell } from 'lucide-react';

import {
  setAvatarAction,
  navigateAction,
  type NotificationTypeConfig,
} from '../notificationConfig';

const wolkeSetup: NotificationTypeConfig = {
  label: 'Wolke verbunden',
  description: 'Benachrichtigung bei Wolke-Einrichtung',
  icon: Bell,
  image: '/images/profileimages/10.svg',
  group: 'system',
  actions: (ctx) => [
    setAvatarAction(10, 'Wolki aktivieren')(ctx),
    navigateAction('/profile', 'Profil öffnen')(ctx),
  ],
};

export default wolkeSetup;
