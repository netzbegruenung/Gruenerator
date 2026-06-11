import { useState } from 'react';

interface InstagramEmbedProps {
  username: string;
}

export function InstagramEmbed({ username }: InstagramEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);
  const cleanUsername = username.replace(/^@/, '');
  const embedUrl = `https://www.instagram.com/${cleanUsername}/embed`;

  return (
    <div className="w-full max-w-full sm:max-w-[540px] min-h-[450px] bg-neutral-600 rounded-md overflow-hidden">
      {isLoading && (
        <div className="flex items-center justify-center min-h-[450px] text-grey-400">
          <span className="w-8 h-8 border-[3px] border-grey-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      )}
      <iframe
        src={embedUrl}
        title={`Instagram-Profil von @${cleanUsername}`}
        onLoad={() => setIsLoading(false)}
        className="w-full h-full min-h-[450px] border-none"
        style={{ display: isLoading ? 'none' : 'block' }}
        allow="encrypted-media"
      />
    </div>
  );
}
