interface BrandLogoProps {
  compact?: boolean;
  tagline?: string;
  badge?: string;
}

export function BrandLogo({ compact = false, tagline, badge }: BrandLogoProps) {
  return (
    <div className={`brand-logo ${compact ? "is-compact" : ""}`.trim()}>
      {badge ? <div className="brand-badge">{badge}</div> : null}
      <div className="brand-mark">
        <div className="brand-symbol" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
            <path d="M11 11L20 20M20 20L29 11M20 20L11 29M20 20L29 29" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="20" cy="20" r="3" fill="white" />
          </svg>
        </div>
        <div>
          <div className="brand-wordmark wordmark">
            Xamin<span>a</span>
          </div>
          {tagline ? <p className="state-text">{tagline}</p> : null}
        </div>
      </div>
    </div>
  );
}
