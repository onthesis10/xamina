interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
  card?: boolean;
}

export function LoadingSkeleton({ lines = 3, className = "", card = false }: LoadingSkeletonProps) {
  return (
    <div className={card ? `card skeleton-card ${className}`.trim() : className}>
      <div className="skeleton-stack" aria-hidden="true">
        {Array.from({ length: lines }).map((_, index) => (
          <span
            key={index}
            className={`skeleton-line ${index === 0 ? "skeleton-line-lg" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
