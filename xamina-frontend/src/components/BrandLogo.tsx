/**
 * Legacy BrandLogo — now delegates to XaminaLogo.
 * Kept for backward-compatibility with Sidebar and other internal usages.
 */
import { XaminaLogo } from "./XaminaLogo";

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
        <XaminaLogo variant="animated-icon" />
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
