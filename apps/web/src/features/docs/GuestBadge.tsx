interface GuestBadgeProps {
  guestName: string;
  guestColor: string;
  loginUrl: string;
}

export const GuestBadge = ({ guestName, guestColor, loginUrl }: GuestBadgeProps) => (
  <div className="flex items-center gap-2 py-0.5 px-1 pr-2.5 text-[0.75rem] rounded-full bg-secondary-100/60 dark:bg-secondary-600/20 text-secondary-700 dark:text-secondary-400 border border-secondary-200/50 dark:border-secondary-600/25">
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-[0.625rem] font-medium text-white shrink-0"
      style={{ backgroundColor: guestColor }}
    >
      {guestName.charAt(0)}
    </div>
    <span className="font-medium">{guestName}</span>
    <span className="text-secondary-500 dark:text-secondary-500">·</span>
    <a
      href={loginUrl}
      className="text-secondary-800 dark:text-secondary-300 underline hover:text-secondary-900 dark:hover:text-secondary-200"
    >
      Anmelden
    </a>
  </div>
);
