import { Button } from '@gruenerator/ui';
import { useState } from 'react';

import { type HandleCheck } from '../../../hooks/useHandleCheck';
import { useSite } from '../../../hooks/useSite';
import { useToast } from '../../../hooks/useToast';
import { handleApiError } from '../../../utils/errorHandler';
import { SectionHeading } from '../common/Field';

import { AddressField } from './AddressField';
import { SectionVisibility } from './SectionVisibility';
import { VariantPicker } from './VariantPicker';

function AddressSettings() {
  const { site, publicOrigin, updateSite, isUpdating } = useSite();
  const toast = useToast();
  const saved = site ? site.subdomain : null;
  const locked = site ? site.last_published !== null : false;
  const [value, setValue] = useState<string | null>(null);
  const input = value ?? saved ?? '';
  const [state, setState] = useState<HandleCheck>('idle');

  if (!site) return null;

  const apply = async () => {
    try {
      await updateSite({ id: site.id, data: { subdomain: input.trim().toLowerCase() } });
      setValue(null);
      toast.success('Adresse übernommen');
    } catch (err) {
      handleApiError(err, toast);
    }
  };

  return (
    <div>
      <AddressField
        id="site-address"
        value={input}
        onChange={setValue}
        current={saved}
        publicOrigin={publicOrigin}
        locked={locked}
        disabled={isUpdating}
        onStateChange={setState}
      />
      {!locked && (
        <Button
          type="button"
          onClick={apply}
          disabled={state !== 'available' || isUpdating}
          className="mt-xs"
        >
          Adresse übernehmen
        </Button>
      )}
    </div>
  );
}

export function SettingsPanel() {
  return (
    <div>
      <SectionHeading>Einstellungen</SectionHeading>

      <section className="mb-xl" aria-labelledby="settings-address">
        <h4 id="settings-address" className="mb-sm text-base font-semibold text-foreground">
          Adresse
        </h4>
        <AddressSettings />
      </section>

      <section className="mb-xl" aria-labelledby="settings-variant">
        <h4 id="settings-variant" className="mb-sm text-base font-semibold text-foreground">
          Farbvariante
        </h4>
        <VariantPicker />
      </section>

      <section aria-labelledby="settings-sections">
        <h4 id="settings-sections" className="mb-sm text-base font-semibold text-foreground">
          Sichtbare Abschnitte
        </h4>
        <SectionVisibility />
      </section>
    </div>
  );
}
