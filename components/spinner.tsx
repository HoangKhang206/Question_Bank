export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ${className}`} />
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="bg-white border rounded p-3 animate-pulse">
          <div className="flex gap-2 mb-2">
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
          </div>
          <div className="h-3 w-3/4 bg-gray-200 rounded" />
        </li>
      ))}
    </ul>
  );
}
