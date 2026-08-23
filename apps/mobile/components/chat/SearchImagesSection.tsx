import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

import { openUrl } from '../../services/share';
import { secureStorage } from '../../services/storage';
import { spacing, borderRadius, BODY_FONT, chatType } from '../../theme';

import {
  buildSearchImagesView,
  proxyImageUri,
  type SearchImage,
  type SearchImageTile,
} from './searchImagesView';

import type { Theme } from '../../theme/colors';

/**
 * Image hits from the web search — the native counterpart of web's
 * SearchImagesSection, and it inherits that file's governing rule verbatim:
 *
 * THE PHONE MUST NEVER REQUEST ANYTHING FROM THE SOURCE HOST. An `<Image>`
 * pointed at `image.url` would announce the reader's IP, and what they are
 * reading, to whoever runs a host a search engine happened to return. Pictures
 * come ONLY through `proxyUrl`, our own signed, short-lived endpoint; a tap on a
 * tile opens the source in the browser, where the request is the user's own act.
 *
 * Two things can take the thumbnails away, and neither is an error: the backend
 * signs no `proxyUrl` (no secret configured), or the app holds no bearer token
 * (`/api/search-image` is behind `requireAuth`, and a bare `<Image>` GET from
 * React Native carries no session). Either way the block degrades to plain
 * links — losing the pictures, never the privacy property.
 *
 * It renders ABOVE the answer, like web: on a turn that found pictures they are
 * the first thing the reader looks at, and a gallery behind a thousand words is
 * a gallery nobody scrolls to.
 */
export const SearchImagesSection = memo(function SearchImagesSection({
  images,
  theme,
}: {
  images: SearchImage[];
  theme: Theme;
}) {
  const [expanded, setExpanded] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    void secureStorage.getToken().then(setAuthToken);
  }, []);

  const view = useMemo(
    () => buildSearchImagesView(images, { expanded, authenticated: authToken != null }),
    [images, expanded, authToken]
  );

  if (images.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Ionicons name="image-outline" size={13} color={theme.textSecondary} />
        <Text style={[styles.headingText, { color: theme.text }]}>{view.heading}</Text>
      </View>

      {view.mode === 'tiles' ? (
        <View style={styles.grid}>
          {view.tiles.map((tile) => (
            <ImageTile
              key={tile.key}
              tile={tile}
              theme={theme}
              authToken={authToken}
              onMore={() => setExpanded(true)}
            />
          ))}
        </View>
      ) : (
        <View>
          {view.tiles.map((tile) => (
            <ImageLink key={tile.key} tile={tile} theme={theme} />
          ))}
        </View>
      )}

      <Text style={[styles.rights, { color: theme.textSecondary }]}>
        Recherchematerial — die Rechte liegen bei den Urheber*innen. Für eigene Grafiken die
        Bildgenerierung nutzen.
      </Text>
    </View>
  );
});

/**
 * One square tile.
 *
 * A tile that cannot show a picture — this hit carried no `proxyUrl`, or the
 * proxy failed (404, over the size cap, a type we do not pass through) — stays a
 * SQUARE showing the domain rather than collapsing into a text row: it still
 * opens the same source, and a text line wedged into a third of the width would
 * break the grid around it for no gain.
 *
 * The counter is drawn last and over everything, because it is the only way into
 * the rest of the set; a failed picture must not take it down with it, or a set
 * of nine would silently be a set of three.
 */
const ImageTile = memo(function ImageTile({
  tile,
  theme,
  authToken,
  onMore,
}: {
  tile: SearchImageTile;
  theme: Theme;
  authToken: string | null;
  onMore: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const isCounter = tile.moreCount > 0;
  const showPicture = tile.thumbnailPath != null && authToken != null && !failed;

  return (
    <Pressable
      style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
      onPress={() => (isCounter ? onMore() : void openUrl(tile.linkUrl))}
      accessibilityRole="button"
      accessibilityLabel={
        isCounter
          ? `${tile.moreCount} weitere Bildquellen anzeigen`
          : `${tile.title} — ${tile.domain} öffnen`
      }
    >
      <View style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {showPicture && tile.thumbnailPath ? (
          <Image
            // Same-origin proxy only. Never `tile.linkUrl` — see the file comment.
            source={{
              uri: proxyImageUri(tile.thumbnailPath),
              ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
            }}
            style={styles.tileImage}
            contentFit="cover"
            transition={150}
            onError={() => setFailed(true)}
            accessibilityLabel={tile.title}
          />
        ) : (
          <View style={styles.tileFallback}>
            <Ionicons name="link-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.tileDomain, { color: theme.textSecondary }]} numberOfLines={1}>
              {tile.domain}
            </Text>
          </View>
        )}
        {isCounter && (
          <View style={styles.counter}>
            <Ionicons name="images-outline" size={13} color="#FFFFFF" />
            <Text style={styles.counterText}>+{tile.moreCount}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

const ImageLink = memo(function ImageLink({
  tile,
  theme,
}: {
  tile: SearchImageTile;
  theme: Theme;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.link, pressed && styles.cellPressed]}
      onPress={() => void openUrl(tile.linkUrl)}
      accessibilityRole="link"
      accessibilityLabel={`${tile.title} — ${tile.domain}`}
    >
      <Ionicons name="link-outline" size={13} color={theme.textSecondary} />
      <Text style={[styles.linkTitle, { color: theme.text }]} numberOfLines={1}>
        {tile.title}
      </Text>
      <Text style={[styles.linkDomain, { color: theme.textSecondary }]} numberOfLines={1}>
        {tile.domain}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.small,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    marginBottom: spacing.xxsmall,
  },
  headingText: {
    ...chatType.chatMeta,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxsmall,
  },
  // Three across, with the two gaps taken out of the width. `flexBasis` rather
  // than `flex: 1` so an expanded set wraps into further rows of three instead
  // of squeezing everything onto one line.
  cell: {
    flexBasis: '31.5%',
    flexGrow: 0,
  },
  cellPressed: {
    opacity: 0.7,
  },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  tileImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tileFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.xxsmall,
  },
  tileDomain: {
    ...chatType.chatMicro,
    maxWidth: '100%',
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 2,
    margin: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  counterText: {
    ...chatType.chatMicro,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  rights: {
    ...chatType.chatMicro,
    marginTop: spacing.xxsmall,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xxsmall,
  },
  linkTitle: {
    ...chatType.chatLabel,
    flexShrink: 1,
    fontFamily: BODY_FONT,
  },
  linkDomain: {
    ...chatType.chatMicro,
    flexShrink: 0,
  },
});
