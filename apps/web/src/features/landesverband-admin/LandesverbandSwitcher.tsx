import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@gruenerator/ui';
import { useNavigate } from 'react-router-dom';

import { useMyLandesverbandAdminScopes } from './hooks/useLandesverbandAdmin';

/**
 * Renders nothing when the user administers exactly one Landesverband (the
 * common case) — only a genuine choice (multiple scopes, e.g. a
 * super-admin) gets a `Select`. Never shows the full ~16-entry LV registry,
 * only the caller's own scopes.
 */
export default function LandesverbandSwitcher({ currentLvId }: { currentLvId: string }) {
  const { data: scopes } = useMyLandesverbandAdminScopes();
  const navigate = useNavigate();

  if (!scopes || scopes.length <= 1) return null;

  return (
    <Select value={currentLvId} onValueChange={(lvId) => navigate(`/admin/landesverband/${lvId}`)}>
      <SelectTrigger className="w-auto min-w-48">
        <SelectValue placeholder="Landesverband wählen" />
      </SelectTrigger>
      <SelectContent>
        {scopes.map((lv) => (
          <SelectItem key={lv.id} value={lv.id}>
            {lv.name} ({lv.country})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
