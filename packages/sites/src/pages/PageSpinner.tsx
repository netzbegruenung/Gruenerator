export function PageSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full gap-4 text-grey-600 dark:text-grey-400">
      <div className="w-10 h-10 border-[3px] border-grey-200 dark:border-grey-700 border-t-primary-600 rounded-full animate-spin" />
      <p>{label}</p>
    </div>
  );
}
