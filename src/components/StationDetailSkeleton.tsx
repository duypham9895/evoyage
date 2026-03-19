'use client';

interface StationDetailSkeletonProps {
  readonly message: string;
  readonly progress: number;
}

function ShimmerBlock({ className }: { className: string }) {
  return (
    <div
      className={`${className} bg-[var(--color-surface-hover)] rounded animate-pulse`}
    />
  );
}

export default function StationDetailSkeleton({
  message,
  progress,
}: StationDetailSkeletonProps) {
  return (
    <div className="space-y-2 text-xs">
      <div className="h-1 w-full bg-[var(--color-surface)] rounded overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
          style={{ width: progress > 0 ? `${progress}%` : '30%' }}
        >
          {progress === 0 && (
            <div className="h-full w-full bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent animate-[shimmer_1.5s_infinite]" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
        <span className="text-[10px] text-[var(--color-muted)]">{message}</span>
      </div>

      <div className="space-y-1">
        <ShimmerBlock className="h-3 w-24" />
        <ShimmerBlock className="h-6 w-full" />
        <ShimmerBlock className="h-6 w-full" />
      </div>

      <ShimmerBlock className="h-3 w-32" />

      <div className="flex gap-2">
        <ShimmerBlock className="w-20 h-14 shrink-0" />
        <ShimmerBlock className="w-20 h-14 shrink-0" />
        <ShimmerBlock className="w-20 h-14 shrink-0" />
      </div>
    </div>
  );
}
