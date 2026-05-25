import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@gruenerator/ui';
import { Monitor, Moon, Sun } from 'lucide-react';

import { useThemeMode, type ThemeMode } from '../../../../../../components/hooks/useDarkMode';

const AppSettingsSection = () => {
  const [mode, setMode] = useThemeMode();

  const handleChange = (value: string) => {
    // Radix emits '' when the active item is re-pressed — keep the current choice.
    if (value === 'light' || value === 'dark' || value === 'system') {
      setMode(value as ThemeMode);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>App-Einstellungen</CardTitle>
        <CardDescription>Passe an, wie der Grünerator für dich aussieht.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-md flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Erscheinungsbild</p>
            <p className="text-xs text-grey-500 dark:text-grey-400">
              Wähle helles, dunkles oder automatisches Design.
            </p>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={handleChange}
            className="shrink-0"
            aria-label="Erscheinungsbild"
          >
            <ToggleGroupItem value="light" aria-label="Helles Design">
              <Sun className="size-4 mr-xs" />
              Hell
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Dunkles Design">
              <Moon className="size-4 mr-xs" />
              Dunkel
            </ToggleGroupItem>
            <ToggleGroupItem value="system" aria-label="Automatisches Design">
              <Monitor className="size-4 mr-xs" />
              Automatisch
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardContent>
    </Card>
  );
};

export default AppSettingsSection;
