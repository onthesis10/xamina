import React from 'react';
import { cn } from '@/lib/utils';

interface XaminaLogoProps {
    className?: string;
    variant?: 'animated' | 'static' | 'icon-only' | 'animated-icon';
    showText?: boolean;
    text?: string;
    onClick?: () => void;
    style?: React.CSSProperties;
}

export function XaminaLogo({
    className,
    variant = 'animated',
    showText = true,
    text = "Xamina",
    onClick,
    style
}: XaminaLogoProps) {
    const isIconOnly = variant === 'icon-only' || variant === 'animated-icon';
    const effectiveShowText = isIconOnly ? false : showText;
    const isAnimated = variant === 'animated' || variant === 'animated-icon';

    return (
        <div 
            className={cn("flex items-center gap-3 select-none", className)} 
            onClick={onClick} 
            style={style}
            data-testid="xamina-logo-container"
        >
            <svg
                data-testid="xamina-logo-icon"
                width="44"
                height="64"
                viewBox="0 0 110 140"
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0"
                style={{
                    "--base1": "var(--primary, #ff6b00)",
                    "--base2": "var(--primary-2, #ff8c35)",
                    "--highlight": "var(--primary-3, #ffb066)",
                } as React.CSSProperties}
            >
                <defs>
                    <linearGradient
                        id="brandSkeleton"
                        gradientUnits="userSpaceOnUse"
                        x1="-200" y1="0" x2="400" y2="0"
                    >
                        <stop offset="0%" stopColor="var(--base1)" />
                        <stop offset="35%" stopColor="var(--base2)" />
                        {isAnimated ? (
                            <stop offset="50%" stopColor="var(--highlight)">
                                <animate
                                    attributeName="offset"
                                    values="-1;1"
                                    dur="1.8s"
                                    repeatCount="indefinite"
                                />
                            </stop>
                        ) : (
                            <stop offset="50%" stopColor="var(--highlight)" />
                        )}
                        <stop offset="65%" stopColor="var(--base2)" />
                        <stop offset="100%" stopColor="var(--base1)" />
                    </linearGradient>
                </defs>

                <g transform="translate(0,-2)">
                    <rect x="18" y="42" width="30" height="8" rx="4" fill="url(#brandSkeleton)" />
                    <rect x="62" y="42" width="30" height="8" rx="4" fill="url(#brandSkeleton)" />
                    <rect x="26" y="56" width="28" height="8" rx="4" fill="url(#brandSkeleton)" />
                    <rect x="56" y="56" width="28" height="8" rx="4" fill="url(#brandSkeleton)" />
                    <rect x="30" y="70" width="50" height="8" rx="4" fill="url(#brandSkeleton)" />
                    <rect x="26" y="84" width="28" height="8" rx="4" fill="url(#brandSkeleton)" />
                    <rect x="56" y="84" width="28" height="8" rx="4" fill="url(#brandSkeleton)" />
                    <rect x="18" y="98" width="30" height="8" rx="4" fill="url(#brandSkeleton)" />
                    <rect x="62" y="98" width="30" height="8" rx="4" fill="url(#brandSkeleton)" />
                </g>
            </svg>

            {effectiveShowText && (
                <div className="font-sans font-medium text-[24px] tracking-tight text-[var(--text-0)] flex items-center gap-1.5" style={{ marginTop: '2px' }}>
                    {text.startsWith('Xamina') ? (
                        <>
                            <span>
                                Xamin<span className="text-[var(--primary)]">a</span>
                            </span>
                            {text.length > 6 && (
                                <span className="font-normal text-[var(--text-2)] ml-1">
                                    {text.substring(6).trim()}
                                </span>
                            )}
                        </>
                    ) : (
                        <span>{text}</span>
                    )}
                </div>
            )}
        </div>
    );
}
