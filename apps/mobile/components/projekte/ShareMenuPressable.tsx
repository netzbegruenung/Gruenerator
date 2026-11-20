import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { canOpenInApp } from '../../hooks/useGroupContent';
import { type ShareItemActions } from '../../hooks/useShareItemActions';
import { useTheme } from '../../hooks/useTheme';
import { MenuActionSheet } from '../chat/MenuActionSheet';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';

interface ShareMenuPressableProps {
  item: GroupFeedItem;
  shareActions: ShareItemActions | null;
  onOpen: (item: GroupFeedItem) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Eine Kachel in „Alle": Tippen öffnet, langes Drücken zeigt die Verwaltung der
 * Freigabe (Rolle, Entfernen) als Kontextmenü. Wer nichts verwalten darf, bekommt
 * die Kachel wie bisher.
 */
export function ShareMenuPressable({
  item,
  shareActions,
  onOpen,
  accessibilityLabel,
  style,
  children,
}: ShareMenuPressableProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const actions = useMemo(() => shareActions?.actionsFor(item) ?? [], [shareActions, item]);
  const openable = canOpenInApp(item);
  const managed = actions.length > 0;

  return (
    <>
      <Pressable
        onPress={openable ? () => onOpen(item) : undefined}
        onLongPress={managed ? () => setOpen(true) : undefined}
        disabled={!openable && !managed}
        accessibilityRole={openable ? 'button' : 'image'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={managed ? 'Gedrückt halten für weitere Optionen' : undefined}
        style={style}
      >
        {children}
      </Pressable>
      {managed ? (
        <MenuActionSheet
          visible={open}
          theme={theme}
          heading={item.title}
          actions={actions}
          onSelect={(id) => {
            // Das Menü fährt noch ein; iOS zeigt im selben Tick keinen zweiten Dialog.
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => shareActions?.run(item, id), SHEET_HANDOFF_MS);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
