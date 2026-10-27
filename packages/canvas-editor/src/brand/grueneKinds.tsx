/**
 * The element kinds the Grünerator draws itself: the Balken of the
 * three-line sharepics. The editor holds their state and stacks, selects and
 * removes them; the package entry (`src/index.ts`) installs their look
 * (`registerKindRenderers`).
 */
import {
  createSelectableWrapper,
  type HostKindRenderers,
} from '@ggraphic/editor/components/kindRenderers';

import { BalkenGroup } from '../primitives/BalkenGroup';

import type { SnapLine } from '@ggraphic/editor/utils/snapping';

export { registerKindRenderers } from '@ggraphic/editor/components/kindRenderers';

const SelectableBalkenGroup = createSelectableWrapper(BalkenGroup);

export const GRUENE_KIND_RENDERERS: HostKindRenderers = {
  balken: (item, ctx) => {
    const { handlers, handleSnapChange, setSnapLines, getSnapTargets, stageWidth, stageHeight } =
      ctx;
    const balken = item.data;
    return (
      <SelectableBalkenGroup
        key={balken.id}
        elementId={balken.id}
        id={balken.id}
        mode={balken.mode}
        colorSchemeId={balken.colorSchemeId}
        offset={balken.offset}
        scale={balken.scale}
        widthScale={balken.widthScale}
        texts={balken.texts}
        rotation={balken.rotation}
        barOffsets={balken.barOffsets}
        onSelect={() => handlers.handleBalkenSelect(balken.id)}
        onTextChange={(idx, txt) => handlers.handleBalkenTextChange(balken.id, idx, txt)}
        onDragEnd={(x, y) => handlers.handleBalkenDragEnd(balken.id, x, y)}
        onTransformEnd={(x, y, s, r) => handlers.handleBalkenTransformEnd(balken.id, x, y, s, r)}
        onSnapChange={handleSnapChange}
        onSnapLinesChange={(lines) => setSnapLines(lines as SnapLine[])}
        getSnapTargets={getSnapTargets}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        opacity={balken.opacity ?? 1}
      />
    );
  },
};
