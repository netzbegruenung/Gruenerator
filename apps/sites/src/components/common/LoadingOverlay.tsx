interface LoadingOverlayProps {
  isLoading: boolean;
  message: string;
  progress?: number;
  submessage?: string;
}

export function LoadingOverlay({ isLoading, message, progress, submessage }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] animate-[fade-in_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div className="bg-white rounded-xl p-8 shadow-[0_10px_40px_rgba(0,0,0,0.2)] max-w-[400px] w-[90%] text-center">
        <div className="w-[60px] h-[60px] mx-auto mb-6 border-4 border-grey-100 border-t-primary-950 rounded-full animate-[spin_0.8s_linear_infinite]" />
        <p className="text-lg font-medium text-grey-800 mb-2">{message}</p>
        {submessage && <p className="text-sm text-grey-600 mb-6">{submessage}</p>}
        {progress !== undefined && progress > 0 && (
          <div className="mt-6 relative">
            <div
              className="h-2 bg-primary-950 rounded transition-[width_0.3s_ease-out] shadow-[0_0_10px_rgba(0,84,55,0.3)]"
              style={{ width: `${progress}%` }}
            />
            <span className="block mt-2 text-sm font-medium text-grey-600">{progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
