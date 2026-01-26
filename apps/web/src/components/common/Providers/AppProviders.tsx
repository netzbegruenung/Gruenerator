// SharepicGeneratorProvider removed - using useSharepicStore directly
// FormProvider removed - using generatedTextStore directly

interface AppProvidersProps {
  children: React.ReactNode;
  withSharepic?: boolean;
  withForm?: boolean;
  pathname?: string;
}

const AppProviders = ({ children, withSharepic = false, pathname }: AppProvidersProps) => {
  const wrapped = children;

  // FormProvider removed - no global form state needed anymore
  // SharepicGeneratorProvider removed - using Zustand store directly

  return wrapped;
};

export default AppProviders;
