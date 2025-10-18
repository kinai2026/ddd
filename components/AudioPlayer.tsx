"use client";

import { useState } from 'react';

type Props = {
  src?: string;
  title?: string;
};

export default function AudioPlayer({ src, title = 'Generated Track' }: Props) {
  const [isReady, setIsReady] = useState(false);

  return (
    <div className="rounded-md border border-gray-800 bg-gray-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">{title}</span>
        {!src && <span className="text-xs text-gray-500">No audio yet</span>}
      </div>
      <audio
        className="w-full"
        controls
        src={src}
        onCanPlay={() => setIsReady(true)}
        aria-label="Audio player"
      />
      {!isReady && src && (
        <p className="mt-2 text-xs text-gray-400">Loading audio preview…</p>
      )}
    </div>
  );
}
