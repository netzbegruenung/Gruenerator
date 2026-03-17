import { useMemo } from 'react';
import { useWatch, type Control, type FieldValues } from 'react-hook-form';
import { HiGlobeAlt, HiShieldCheck } from 'react-icons/hi';

import type {
  FeatureToggle as FeatureToggleType,
  FeaturesConfig,
} from '../../../../types/baseform';

interface FeatureToggles {
  webSearch: boolean;
  privacyMode: boolean;
  proMode: boolean;
}

interface UseFormFeaturesReturn {
  toggles: FeatureToggles;
  featuresConfig: FeaturesConfig;
}

const useFormFeatures = (
  control: Control<FieldValues>,
  defaultValues: Record<string, unknown>,
  features: string[],
  generatorType: string | null,
  setFieldValue: (name: string, value: unknown) => void
): UseFormFeaturesReturn => {
  const webSearch = useWatch({
    control,
    name: 'useWebSearchTool',
    defaultValue: (defaultValues.useWebSearchTool ?? false) as boolean,
  });

  const privacyMode = useWatch({
    control,
    name: 'usePrivacyMode',
    defaultValue: (defaultValues.usePrivacyMode ?? false) as boolean,
  });

  const proMode = useWatch({
    control,
    name: 'useProMode',
    defaultValue: (defaultValues.useProMode ?? false) as boolean,
  });

  const toggles = useMemo(
    () => ({ webSearch, privacyMode, proMode }),
    [webSearch, privacyMode, proMode]
  );

  const webSearchToggle = useMemo(
    (): FeatureToggleType => ({
      isActive: Boolean(toggles.webSearch),
      onToggle: (checked: boolean) => setFieldValue('useWebSearchTool', checked),
      label: 'Websuche verwenden',
      icon: HiGlobeAlt,
      description: '',
    }),
    [toggles.webSearch, setFieldValue]
  );

  const privacyModeToggle = useMemo(
    (): FeatureToggleType => ({
      isActive: Boolean(toggles.privacyMode),
      onToggle: (checked: boolean) => setFieldValue('usePrivacyMode', checked),
      label: 'Privacy-Mode',
      icon: HiShieldCheck,
      description: 'Verwendet deutsche Server der Netzbegrünung.',
    }),
    [toggles.privacyMode, setFieldValue]
  );

  const proModeToggle = useMemo((): FeatureToggleType | null => {
    if (!generatorType || !features.includes('proMode')) return null;
    return {
      isActive: Boolean(toggles.proMode),
      onToggle: (checked: boolean) => setFieldValue('useProMode', checked),
      label: 'Pro-Mode',
      description: 'Nutzt ein fortgeschrittenes Sprachmodell – ideal für komplexere Texte.',
    };
  }, [generatorType, features, toggles.proMode, setFieldValue]);

  const featuresConfig = useMemo(
    (): FeaturesConfig => ({
      webSearch: features.includes('webSearch')
        ? { enabled: true, toggle: webSearchToggle ?? undefined }
        : undefined,
      privacyMode: features.includes('privacyMode')
        ? { enabled: true, toggle: privacyModeToggle ?? undefined }
        : undefined,
      proMode: features.includes('proMode')
        ? { enabled: true, toggle: proModeToggle ?? undefined }
        : undefined,
    }),
    [features, webSearchToggle, privacyModeToggle, proModeToggle]
  );

  return { toggles, featuresConfig };
};

export default useFormFeatures;
