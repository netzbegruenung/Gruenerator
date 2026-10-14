import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import {
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  GRADIENT_SWATCHES,
  parseSavedProfilbild,
  presetDesigns,
  PROFILBILD_IMAGE_TYPE,
  PROFILBILD_METADATA_KEY,
  type SavedProfilbild,
  type SavedProfilbildBackground,
  type SavedProfilbildSticker,
} from '@gruenerator/shared/profilbild';
import { useShareStore } from '@gruenerator/shared/share';
import { isAssetStickerId } from '@gruenerator/shared/stickers';
import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { useCallback, useRef } from 'react';

import { CUSTOM_ID, type CustomBackground } from '../../components/profilbild/BackgroundPicker';
import {
  restoreStickers,
  savedStickers,
  type ProfilbildModel,
} from '../../components/profilbild/sceneModel';
import { resolveChatUrl } from '../../services/chatApiUrl';
import { secureStorage } from '../../services/storage';

/** The model plus the picker selection it was made with. */
export interface ProfilbildSnapshot {
  model: ProfilbildModel;
  backgroundId: string;
  custom: CustomBackground | null;
}

export interface ProfilbildReopen extends ProfilbildSnapshot {
  shareToken: string;
  person: SkImage;
  /** The cached cutout file, standing in for the photo the cutout came from. */
  personUri: string;
  /** Where the restored custom background is stored, so it is not uploaded again. */
  customUrl: string | null;
  /** Gallery sticker images by share path. */
  gallery: Record<string, SkImage>;
  /** Gallery stickers whose image did not load; saved again as they were. */
  unrestored: SavedProfilbildSticker[];
}

async function downloadShareFile(path: string, name: string): Promise<string> {
  const token = await secureStorage.getToken();
  const file = await File.downloadFileAsync(
    resolveChatUrl(path),
    new File(Paths.cache, `${name}-${Date.now()}`),
    { idempotent: true, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) }
  );
  return file.uri;
}

async function decode(uri: string): Promise<SkImage> {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new Error('decode failed');
  return image;
}

function restoreBackground(
  bg: SavedProfilbildBackground,
  custom: CustomBackground | null,
  isAustria: boolean
): { backgroundId: string; background: ProfilbildModel['background'] } {
  if (bg.kind === 'custom' && custom)
    return { backgroundId: CUSTOM_ID, background: { kind: 'image', image: custom.image } };
  const swatches = [...(isAustria ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE), ...GRADIENT_SWATCHES];
  const id = bg.kind === 'id' ? bg.id : '';
  const swatch = swatches.find((s) => s.id === id);
  if (swatch) return { backgroundId: swatch.id, background: swatch.background };
  if (presetDesigns(isAustria).some((p) => p.id === id))
    return { backgroundId: id, background: { kind: 'preset', designId: id } };
  // An id this locale lacks falls back to its first colour, as on web.
  const first = swatches[0];
  return { backgroundId: first.id, background: first.background };
}

export interface ShareImage {
  uri: string;
  image: SkImage;
}

const shareImages = new Map<string, Promise<ShareImage>>();

/** A media-store file (`/api/share/<token>/download`) as a Skia image, loaded once per src. */
export function loadShareImage(src: string): Promise<ShareImage> {
  let pending = shareImages.get(src);
  if (!pending) {
    pending = downloadShareFile(src, 'profilbild-galerie').then(async (uri) => ({
      uri,
      image: await decode(uri),
    }));
    pending.catch(() => shareImages.delete(src));
    shareImages.set(src, pending);
  }
  return pending;
}

/** Loads a saved Profilbild: its state from the share, the cutout and own photo from storage. */
export async function loadProfilbildReopen(
  shareToken: string,
  isAustria: boolean
): Promise<ProfilbildReopen> {
  const res = await getContractsClient().sharesRead.getMyShare({ params: { shareToken } });
  if (res.status !== 200) throw new Error('Profilbild nicht gefunden');
  const saved = parseSavedProfilbild(res.body.share.imageMetadata);
  if (!saved) throw new Error('Kein gespeichertes Profilbild');

  const personUri = await downloadShareFile(`/api/share/${shareToken}/original`, 'profilbild');
  const person = await decode(personUri);
  let custom: CustomBackground | null = null;
  if (saved.background.kind === 'custom') {
    const uri = await downloadShareFile(saved.background.url, 'profilbild-hintergrund');
    custom = { uri, image: await decode(uri), galleryUrl: null };
  }

  const gallery: Record<string, SkImage> = {};
  const assetSrcs = new Set(
    saved.stickers.flatMap((s) => (isAssetStickerId(s.id) && s.src ? [s.src] : []))
  );
  await Promise.all(
    [...assetSrcs].map((src) =>
      loadShareImage(src).then(
        ({ image }) => {
          gallery[src] = image;
        },
        () => {}
      )
    )
  );

  const { backgroundId, background } = restoreBackground(saved.background, custom, isAustria);
  const { stickers, unrestored } = restoreStickers(saved.stickers, (src) => src in gallery);
  return {
    shareToken,
    person,
    personUri,
    model: { background, person: saved.person, stickers },
    backgroundId,
    custom,
    customUrl: saved.background.kind === 'custom' ? saved.background.url : null,
    gallery,
    unrestored,
  };
}

async function uploadCustomBackground(uri: string): Promise<string> {
  const form = new FormData();
  // RN's FormData takes a file descriptor; `new Blob([bytes])` throws on RN.
  form.append('file', {
    uri,
    name: 'profilbild-hintergrund.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  form.append('uploadSource', 'profilbild-background');
  const res = await getGlobalApiClient().post<{ data?: { shareToken?: string } }>(
    '/media/upload',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  const token = res.data?.data?.shareToken;
  if (!token) throw new Error('Hintergrundbild konnte nicht gespeichert werden.');
  return `/api/share/${token}/download`;
}

const toDataUrl = (base64: string) => `data:image/png;base64,${base64}`;

/**
 * Saves exported Profilbilder like web does: one share per editor session,
 * created on the first export and updated after that, carrying the editor state
 * so „Zuletzt" can reopen it. Only call it with a ready person.
 */
export function useProfilbildShare() {
  const { createImageShare, updateImageShare } = useShareStore();
  const queryClient = useQueryClient();
  const shareToken = useRef<string | null>(null);
  const uploaded = useRef(new Map<string, string>());
  const unrestored = useRef<SavedProfilbildSticker[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Bumped per photo, so a create still in flight cannot hand its share to the next photo.
  const session = useRef(0);

  /**
   * A reopened Profilbild keeps updating its share; a fresh photo (null) starts a
   * new one. Uploads are per share: purging one Profilbild deletes its background.
   */
  const begin = useCallback((reopen: ProfilbildReopen | null) => {
    session.current += 1;
    shareToken.current = reopen?.shareToken ?? null;
    uploaded.current.clear();
    if (reopen?.custom && reopen.customUrl)
      uploaded.current.set(reopen.custom.uri, reopen.customUrl);
    unrestored.current = reopen?.unrestored ?? [];
  }, []);

  const persist = useCallback(
    async (
      imageBase64: string,
      person: SkImage,
      snapshot: ProfilbildSnapshot,
      forSession: number
    ) => {
      if (forSession !== session.current) return;
      let background: SavedProfilbildBackground;
      if (snapshot.backgroundId === CUSTOM_ID && snapshot.custom) {
        const { uri, galleryUrl } = snapshot.custom;
        const url = galleryUrl ?? uploaded.current.get(uri) ?? (await uploadCustomBackground(uri));
        if (!galleryUrl) uploaded.current.set(uri, url);
        background = { kind: 'custom', url };
      } else {
        background = { kind: 'id', id: snapshot.backgroundId };
      }
      const saved: SavedProfilbild = {
        v: 1,
        person: snapshot.model.person,
        background,
        stickers: savedStickers(snapshot.model.stickers, unrestored.current),
      };
      const metadata = { source: 'profilbild', [PROFILBILD_METADATA_KEY]: saved };
      if (shareToken.current) {
        await updateImageShare({
          shareToken: shareToken.current,
          imageBase64: toDataUrl(imageBase64),
          title: 'Profilbild',
          metadata,
        });
      } else {
        const share = await createImageShare({
          imageData: toDataUrl(imageBase64),
          title: 'Profilbild',
          imageType: PROFILBILD_IMAGE_TYPE,
          contentOrigin: 'sharepic',
          metadata,
          originalImage: toDataUrl(person.encodeToBase64(ImageFormat.PNG, 100)),
          status: 'ready',
        });
        if (forSession === session.current) shareToken.current = share.shareToken;
      }
      await queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
    },
    [createImageShare, updateImageShare, queryClient]
  );

  const save = useCallback(
    (imageBase64: string, person: SkImage, snapshot: ProfilbildSnapshot) => {
      const forSession = session.current;
      const run = queue.current.then(() => persist(imageBase64, person, snapshot, forSession));
      queue.current = run.catch(() => {});
      return run;
    },
    [persist]
  );

  return { save, begin };
}
