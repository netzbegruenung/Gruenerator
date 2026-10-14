import atGruenWaehlen from '../../assets/profilbild/at-gruen-waehlen.png';
import atJetztGruen from '../../assets/profilbild/at-jetzt-gruen.png';
import atKlimaSchuetzen from '../../assets/profilbild/at-klima-schuetzen.png';
import grueneLogoAt from '../../assets/profilbild/gruene-at-logo-weiss.png';
import grueneLogoDe from '../../assets/profilbild/gruene-de-logo-weiss.png';
import regenbogenHerz from '../../assets/profilbild/regenbogen-herz.png';
import regenbogen from '../../assets/profilbild/regenbogen.png';
import sonnenblumeGruen from '../../assets/profilbild/sonnenblume_gruen.png';
import sonnenblumeGelb from '../../assets/profilbild/Sonnenblume_RGB_gelb.png';
import sonnenblumeWeiss from '../../assets/profilbild/sonnenblume_weiss.png';
import teamgruen from '../../assets/profilbild/teamgruen.png';
import vielfalt from '../../assets/profilbild/vielfalt.png';

import type { ProfilbildAssetSrc } from '@gruenerator/shared/profilbild';

export const PROFILBILD_ASSETS: Record<ProfilbildAssetSrc, number> = {
  '/images/Sonnenblume_RGB_gelb.png': sonnenblumeGelb,
  '/sonnenblume_gruen.png': sonnenblumeGruen,
  '/sonnenblume_weiss.svg': sonnenblumeWeiss,
  '/studio-tools/stickers/teamgruen.svg': teamgruen,
  '/studio-tools/stickers/regenbogen.svg': regenbogen,
  '/studio-tools/stickers/regenbogen-herz.svg': regenbogenHerz,
  '/studio-tools/stickers/vielfalt.svg': vielfalt,
  '/studio-tools/stickers/at-gruen-waehlen.png': atGruenWaehlen,
  '/studio-tools/stickers/at-klima-schuetzen.png': atKlimaSchuetzen,
  '/studio-tools/stickers/at-jetzt-gruen.png': atJetztGruen,
  '/gruene-de-logo-weiss.png': grueneLogoDe,
  '/gruene-at-logo-weiss.png': grueneLogoAt,
};
