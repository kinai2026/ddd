export default function Loading() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="mb-4 h-5 w-40 rounded bg-gray-800" />
      <div className="space-y-2">
        <div className="h-10 rounded bg-gray-800" />
        <div className="h-24 rounded bg-gray-800" />
        <div className="h-10 rounded bg-gray-800" />
        <div className="h-10 w-28 rounded bg-gray-800" />
      </div>
    </div>
  );
}
