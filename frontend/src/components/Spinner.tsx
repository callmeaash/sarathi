/** A small loading indicator with a label for screen readers. */
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex justify-center py-10">
      <span className="size-6 animate-spin rounded-full border-2 border-primary-fixed border-t-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  )
}
