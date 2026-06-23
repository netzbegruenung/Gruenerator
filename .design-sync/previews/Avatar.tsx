import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from '@gruenerator/ui';

// Single avatar with a loaded image, in all three sizes.
export function Sizes() {
  const src = 'https://i.pravatar.cc/96?img=47';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Avatar size="sm">
        <AvatarImage src={src} alt="Carla Brenner" />
        <AvatarFallback>CB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src={src} alt="Carla Brenner" />
        <AvatarFallback>CB</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarImage src={src} alt="Carla Brenner" />
        <AvatarFallback>CB</AvatarFallback>
      </Avatar>
    </div>
  );
}

// Initials fallback (no image) — the muted-tinted default for members
// without a profile photo.
export function Fallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar>
        <AvatarFallback>JF</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>ML</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>RK</AvatarFallback>
      </Avatar>
    </div>
  );
}

// Overlapping AvatarGroup with an overflow count — used to show the
// Teilnehmer:innen of a Veranstaltung or AG.
export function Group() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarImage src="https://i.pravatar.cc/96?img=12" alt="Mitglied" />
        <AvatarFallback>CB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://i.pravatar.cc/96?img=32" alt="Mitglied" />
        <AvatarFallback>JF</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>ML</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://i.pravatar.cc/96?img=5" alt="Mitglied" />
        <AvatarFallback>RK</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+8</AvatarGroupCount>
    </AvatarGroup>
  );
}
