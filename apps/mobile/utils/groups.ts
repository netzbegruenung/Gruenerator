/** German label for a project membership role, as web spells it. */
export function roleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'Eigentümer*in';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Mitglied';
    default:
      return role;
  }
}
