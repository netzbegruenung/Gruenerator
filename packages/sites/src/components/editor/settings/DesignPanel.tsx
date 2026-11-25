import { SectionHeading } from '../common/Field';

import { DesignChoice } from './DesignChoice';
import { VariantPicker } from './VariantPicker';

/** The look of the whole page: its colour variant and the header style. */
export function DesignPanel() {
  return (
    <div>
      <SectionHeading>Design</SectionHeading>

      <section className="mb-xl" aria-labelledby="design-variant">
        <h4 id="design-variant" className="mb-sm text-base font-semibold text-foreground">
          Farbvariante
        </h4>
        <VariantPicker />
      </section>

      <section aria-labelledby="design-header">
        <h4 id="design-header" className="mb-sm text-base font-semibold text-foreground">
          Kopfzeile
        </h4>
        <DesignChoice field="header" />
      </section>
    </div>
  );
}
