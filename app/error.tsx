"use client";

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-xl border border-red-900/40 bg-red-950 p-6 text-red-200">
      <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
      <p className="mb-4 text-sm opacity-90">
        An unexpected error occurred. You can try again or reload the page.
      </p>
      <div className="flex gap-2">
        <button className="button" onClick={() => reset()}>
          Try again
        </button>
        <button
          className="button bg-transparent text-red-300 ring-1 ring-inset ring-red-900/60 hover:bg-red-900/30"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
