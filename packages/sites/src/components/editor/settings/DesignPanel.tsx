import { SectionHeading } from '../common/Field';

import { VariantPicker } from './VariantPicker';

/** The look of the whole page: its colour variant. */
export function DesignPanel() {
  return (
    <div>
      <SectionHeading>Design</SectionHeading>

      <section aria-labelledby="design-variant">
        <h4 id="design-variant" className="mb-sm text-base font-semibold text-foreground">
          Farbvariante
        </h4>
        <VariantPicker />
      </section>
    </div>
  );
}
