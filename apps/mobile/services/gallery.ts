/**
 * Von der Erfolgsmeldung in die Galerie springen.
 *
 * `MediaLibrary.Asset.create` liefert die ID des angelegten Assets: auf Android
 * die `content://`-URI aus dem MediaStore, auf iOS die PHAsset-Kennung
 * (`ph://…`). Nur die Android-Form lässt sich öffnen — ein ACTION_VIEW darauf
 * landet im Galerie-Betrachter genau bei diesem Bild. Für iOS gibt es kein
 * Schema für ein einzelnes Asset; `photos-redirect://` startet die Fotos-App,
 * mehr ist dort nicht zu haben.
 */

import { Alert, Linking, Platform } from 'react-native';

import { getErrorMessage } from '../utils/errors';

/** Startet die Fotos-App — ohne Ziel, weil iOS kein Asset-Schema kennt. */
const IOS_PHOTOS_URL = 'photos-redirect://';

/**
 * Was sich für dieses Asset öffnen lässt — oder `null`, wenn nichts.
 *
 * Eigene reine Funktion, damit die Fallunterscheidung prüfbar ist und die
 * Aufrufer entscheiden können, ob der Knopf überhaupt angeboten wird.
 */
export function galleryTargetUrl(assetId: string | null): string | null {
  if (Platform.OS === 'ios') return IOS_PHOTOS_URL;
  if (Platform.OS !== 'android') return null;
  if (assetId && assetId.startsWith('content://')) return assetId;
  return null;
}

/**
 * Öffnet die Galerie beim gespeicherten Asset.
 *
 * Meldet einen Fehlschlag, statt still nichts zu tun — ein Knopf, der ohne
 * Rückmeldung nichts bewirkt, ist von einem kaputten nicht zu unterscheiden.
 */
export async function openGallery(assetId: string | null): Promise<boolean> {
  const url = galleryTargetUrl(assetId);
  if (!url) return false;

  try {
    // Bewusst ohne `canOpenURL`: das prüft auf Android 11+ gegen die
    // Paket-Sichtbarkeit und meldet „nein“, obwohl der Intent aufgeht.
    await Linking.openURL(url);
    return true;
  } catch (error: unknown) {
    console.warn('[Gallery] openGallery failed:', getErrorMessage(error));
    Alert.alert('Fehler', 'Die Galerie konnte nicht geöffnet werden.');
    return false;
  }
}

/**
 * Die Erfolgsmeldung nach dem Speichern — mit Weg in die Galerie, wo es einen
 * gibt, und sonst mit dem blanken Hinweis von vorher.
 */
export function alertSavedToGallery(assetId: string | null, message: string): void {
  if (!galleryTargetUrl(assetId)) {
    Alert.alert('Gespeichert', message);
    return;
  }

  Alert.alert('Gespeichert', message, [
    { text: 'OK', style: 'cancel' },
    { text: 'In Galerie anzeigen', onPress: () => void openGallery(assetId) },
  ]);
}
