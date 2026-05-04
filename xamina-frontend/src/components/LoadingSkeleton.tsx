interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
  card?: boolean;
  circle?: boolean;
}

export function LoadingSkeleton({ lines = 3, className = "", card = false, circle = false }: LoadingSkeletonProps) {
  return (
    <div 
      className={`relative overflow-hidden bg-white/[0.03] ${card ? "card rounded-2xl p-6" : ""} ${circle ? "rounded-full" : "rounded-lg"} ${className}`} 
      aria-hidden="true"
    >
      {/* Shimmer overlay */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-shimmer" />
      
      {!circle && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className={`bg-white/[0.05] rounded ${index === 0 ? "w-3/4 h-5 mb-1" : index === lines - 1 ? "w-1/2 h-3" : "w-full h-3"}`}
            />
          ))}
        </div>
      )}
      {circle && <div className="w-full h-full bg-white/[0.05]" />}
    </div>
  );
}
