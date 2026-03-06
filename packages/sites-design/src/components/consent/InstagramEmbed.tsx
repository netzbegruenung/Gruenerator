import { useState } from 'react';

interface InstagramEmbedProps {
  username: string;
}

export function InstagramEmbed({ username }: InstagramEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);
  const cleanUsername = username.replace(/^@/, '');
  const embedUrl = `https://www.instagram.com/${cleanUsername}/embed`;

  return (
    <div className="instagram-embed-container">
      {isLoading && <div className="instagram-embed-loading" />}
      <iframe
        src={embedUrl}
        title={`Instagram-Profil von @${cleanUsername}`}
        onLoad={() => setIsLoading(false)}
        style={{ display: isLoading ? 'none' : 'block' }}
        allow="encrypted-media"
      />
    </div>
  );
}
