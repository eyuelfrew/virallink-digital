/**
 * Loading state for the public route group.
 *
 * Shown while a server component page is being rendered. The skeleton mirrors
 * the page header pattern so the swap to real content is calm rather than
 * jumpy.
 */
export default function Loading() {
  return (
    <div className="container-page section" role="status" aria-label="Loading page">
      <span className="skeleton block h-3 w-28" />
      <span className="skeleton mt-5 block h-10 w-full max-w-xl" />
      <span className="skeleton mt-3 block h-10 w-full max-w-md" />
      <span className="skeleton mt-8 block h-4 w-full max-w-2xl" />
      <span className="skeleton mt-3 block h-4 w-full max-w-lg" />
    </div>
  );
}
