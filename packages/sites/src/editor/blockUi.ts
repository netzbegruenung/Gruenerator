import { type SiteBlockType } from '@gruenerator/contracts';
import { type IconType } from 'react-icons';
import { FiAtSign, FiFlag, FiGrid, FiImage, FiInstagram, FiMail, FiUser } from 'react-icons/fi';

/** How the editor names and shows each block type; the one list the sidebar and toolbar read. */
export const SITE_BLOCK_UI: Record<
  SiteBlockType,
  { label: string; description: string; icon: IconType }
> = {
  hero: { label: 'Profil', description: 'Name, Tagline und Porträt ganz oben', icon: FiUser },
  about: { label: 'Über mich', description: 'Ein Text über dich', icon: FiAtSign },
  heroImage: {
    label: 'Hero-Bild',
    description: 'Ein großes Bild mit Botschaft',
    icon: FiImage,
  },
  themes: { label: 'Themen', description: 'Bis zu sechs Themen mit Bild und Text', icon: FiGrid },
  actions: {
    label: 'Aktionen',
    description: 'Kacheln, die zum Mitmachen einladen',
    icon: FiFlag,
  },
  socialFeed: {
    label: 'Instagram',
    description: 'Deine letzten Instagram-Beiträge',
    icon: FiInstagram,
  },
  contact: { label: 'Kontakt', description: 'E-Mail, Telefon und Netzwerke', icon: FiMail },
};
