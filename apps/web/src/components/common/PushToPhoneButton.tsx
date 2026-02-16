import { pushToPhone, getUserDevices, type UserDevice } from '@gruenerator/shared/share';
import { useState, useEffect, useCallback } from 'react';
import { IoPhonePortraitOutline, IoCheckmarkOutline } from 'react-icons/io5';

import Spinner from './Spinner';

interface PushToPhoneButtonProps {
  shareToken: string | null;
  onCaptureCanvas?: () => void;
}

let cachedDevices: UserDevice[] | null = null;

export function PushToPhoneButton({ shareToken, onCaptureCanvas }: PushToPhoneButtonProps) {
  const [devices, setDevices] = useState<UserDevice[] | null>(cachedDevices);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (cachedDevices !== null) return;

    getUserDevices()
      .then((res) => {
        if (res.success) {
          cachedDevices = res.devices;
          setDevices(res.devices);
        }
      })
      .catch(() => {
        // Silently fail — button will be hidden
      });
  }, []);

  const pushableDevices = devices?.filter((d) => d.has_push_token) ?? [];
  const hasDevices = pushableDevices.length > 0;

  const handlePush = useCallback(async () => {
    if (status === 'sending' || status === 'success') return;

    const token = shareToken;

    // If no share token yet, trigger canvas capture and wait for it
    if (!token && onCaptureCanvas) {
      onCaptureCanvas();
      // The parent component will update shareToken prop once capture completes
      return;
    }

    if (!token) return;

    setStatus('sending');
    try {
      const result = await pushToPhone(token);
      if (result.success && result.pushedToDevices > 0) {
        setStatus('success');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [shareToken, status, onCaptureCanvas]);

  // Don't render if no devices loaded yet or no pushable devices
  if (devices === null) return null;
  if (!hasDevices) return null;

  const title =
    status === 'success'
      ? 'An Handy gesendet!'
      : status === 'error'
        ? 'Senden fehlgeschlagen'
        : `Auf Handy senden (${pushableDevices.length} Gerät${pushableDevices.length > 1 ? 'e' : ''})`;

  return (
    <button
      className="platform-icon-btn"
      onClick={handlePush}
      disabled={status === 'sending'}
      title={title}
      aria-label="Auf Handy senden"
      type="button"
    >
      {status === 'sending' ? (
        <Spinner size="small" />
      ) : status === 'success' ? (
        <IoCheckmarkOutline />
      ) : (
        <IoPhonePortraitOutline />
      )}
    </button>
  );
}
