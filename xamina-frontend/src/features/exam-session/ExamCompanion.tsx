import { useEffect, useState, useMemo } from "react";
import "./exam-companion.css";

export type CompanionTheme = "dark" | "light" | "happy";
export type CompanionMood = "normal" | "sleepy" | "panic" | "happy";

interface Props {
    theme: CompanionTheme;
    timeLeft: number | null; // in seconds
    isIdle: boolean;
    lastAnsweredAt: number | null; // timestamp of last answer
}

export function ExamCompanion({ theme, timeLeft, isIdle, lastAnsweredAt }: Props) {
    const [mood, setMood] = useState<CompanionMood>("normal");

    // Mood Logic State Machine
    useEffect(() => {
        if (timeLeft !== null && timeLeft > 0 && timeLeft < 60) {
            setMood("panic");
            return;
        }

        if (lastAnsweredAt) {
            const timeSinceAnswer = Date.now() - lastAnsweredAt;
            if (timeSinceAnswer < 3000) {
                setMood("happy");
                return;
            }
        }

        if (isIdle) {
            setMood("sleepy");
            return;
        }

        setMood("normal");
    }, [timeLeft, isIdle, lastAnsweredAt]);

    // Background Generators
    const stars = useMemo(() => Array.from({ length: 30 }).map((_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: `${Math.random() * 3 + 1}px`,
        duration: `${Math.random() * 3 + 2}s`
    })), []);

    const clouds = useMemo(() => Array.from({ length: 6 }).map((_, i) => ({
        id: i,
        top: `${Math.random() * 30 + (i * 10)}%`,
        width: `${Math.random() * 100 + 100}px`,
        height: `${Math.random() * 30 + 30}px`,
        duration: `${Math.random() * 20 + 20}s`,
        delay: `-${Math.random() * 20}s`
    })), []);

    const confettis = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        width: `${Math.random() * 10 + 5}px`,
        height: `${Math.random() * 20 + 10}px`,
        bg: ['#ff4d4f', '#52c41a', '#1890ff', '#faad14', '#722ed1'][Math.floor(Math.random() * 5)],
        duration: `${Math.random() * 3 + 3}s`,
        delay: `-${Math.random() * 5}s`
    })), []);

    return (
        <div className={`companion-container pointer-events-none fixed inset-0 z-0 overflow-hidden companion-theme-${theme}`}>
            {/* Background Layers */}
            <div className={`companion-bg-layer dark-layer bg-slate-950 transition-colors duration-1000 ${theme === 'dark' ? 'active' : ''}`}>
                {stars.map(star => (
                    <div key={star.id} className="star" style={{ top: star.top, left: star.left, width: star.size, height: star.size, animationDuration: star.duration }} />
                ))}
            </div>

            <div className={`companion-bg-layer light-layer bg-sky-100 transition-colors duration-1000 ${theme === 'light' ? 'active' : ''}`}>
                {clouds.map(c => (
                    <div key={c.id} className="cloud" style={{ top: c.top, width: c.width, height: c.height, animationDuration: c.duration, animationDelay: c.delay }} />
                ))}
            </div>

            <div className={`companion-bg-layer happy-layer bg-indigo-50 transition-colors duration-1000 ${theme === 'happy' ? 'active' : ''}`}>
                {confettis.map(c => (
                    <div key={c.id} className="confetti" style={{ left: c.left, width: c.width, height: c.height, backgroundColor: c.bg, animationDuration: c.duration, animationDelay: c.delay }} />
                ))}
            </div>

            {/* Character Positioning (Bottom Left) */}
            <div className={`absolute bottom-8 left-8 w-32 h-32 companion-character mood-${mood}`}>
                {theme === 'dark' && <OwlCharacter mood={mood} />}
                {theme === 'light' && <SunCharacter mood={mood} />}
                {theme === 'happy' && <BrainCharacter mood={mood} />}
                
                {/* Sweat drop for panic mode */}
                <svg className="sweat absolute top-2 right-2 w-6 h-6 text-cyan-400 opacity-0 transition-opacity" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 22C16.4183 22 20 18.4183 20 14C20 9.58172 12 2 12 2C12 2 4 9.58172 4 14C4 18.4183 7.58172 22 12 22Z" />
                </svg>

                {/* Zzz for sleepy mode */}
                <div className="zzzs absolute -top-8 right-0 text-xl font-bold text-slate-400 opacity-0 transition-opacity font-comic">Zzz</div>
            </div>
        </div>
    );
}

function OwlCharacter({ mood }: { mood: CompanionMood }) {
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xl" xmlns="http://www.w3.org/2000/svg">
            {/* Body */}
            <path d="M20 50 C20 10, 80 10, 80 50 C80 90, 70 90, 50 90 C30 90, 20 90, 20 50 Z" fill="#475569" />
            <path d="M30 55 C30 35, 70 35, 70 55 C70 85, 60 85, 50 85 C40 85, 30 85, 30 55 Z" fill="#94a3b8" />
            {/* Eyes */}
            <g className="eye-group origin-center">
                <circle cx="35" cy="45" r="12" fill="#f8fafc" />
                <circle cx="65" cy="45" r="12" fill="#f8fafc" />
                <circle cx="35" cy="45" r="4" fill="#0f172a" className="eye-open transition-opacity duration-300" />
                <circle cx="65" cy="45" r="4" fill="#0f172a" className="eye-open transition-opacity duration-300" />
                <path d="M25 45 Q35 55 45 45" stroke="#0f172a" strokeWidth="3" fill="none" className="eye-closed opacity-0 transition-opacity duration-300" />
                <path d="M55 45 Q65 55 75 45" stroke="#0f172a" strokeWidth="3" fill="none" className="eye-closed opacity-0 transition-opacity duration-300" />
            </g>
            {/* Beak */}
            <polygon points="45,55 55,55 50,65" fill="#fbbf24" />
            {/* Wings */}
            <path d="M20 50 C10 60, 10 70, 25 75" fill="#334155" />
            <path d="M80 50 C90 60, 90 70, 75 75" fill="#334155" />
            {/* Smile for Happy */}
            <path d="M40 70 Q50 80 60 70" stroke="#0f172a" strokeWidth="2" fill="none" className={`mouth-smile transition-transform duration-300 ${mood === 'happy' ? 'scale-100 opacity-100' : 'scale-0 opacity-0'} origin-center`} />
        </svg>
    );
}

function SunCharacter({ mood }: { mood: CompanionMood }) {
    void mood;
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xl origin-center animate-spin-slow" style={{ animationDuration: '20s' }} xmlns="http://www.w3.org/2000/svg">
            {/* Rays */}
            <g fill="#fde047">
                {[...Array(8)].map((_, i) => (
                    <polygon key={i} points="45,5 55,5 50,20" transform={`rotate(${i * 45} 50 50)`} />
                ))}
            </g>
            {/* Face */}
            <circle cx="50" cy="50" r="30" fill="#fef08a" />
            {/* Eyes */}
            <g className="eye-group origin-center" style={{ animation: 'none' /* Override parent spin */ }}>
                <circle cx="40" cy="45" r="4" fill="#3f6212" className="eye-open transition-opacity duration-300" />
                <circle cx="60" cy="45" r="4" fill="#3f6212" className="eye-open transition-opacity duration-300" />
                <path d="M35 45 Q40 50 45 45" stroke="#3f6212" strokeWidth="2" fill="none" className="eye-closed opacity-0 transition-opacity duration-300" />
                <path d="M55 45 Q60 50 65 45" stroke="#3f6212" strokeWidth="2" fill="none" className="eye-closed opacity-0 transition-opacity duration-300" />
            </g>
            {/* Mouth */}
            <path d="M40 55 Q50 65 60 55" stroke="#3f6212" strokeWidth="2" fill="none" className="mouth-smile transition-all duration-300 origin-center" />
        </svg>
    );
}

function BrainCharacter({ mood }: { mood: CompanionMood }) {
    void mood;
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xl overflow-visible" xmlns="http://www.w3.org/2000/svg">
            {/* Limbs (Back) */}
            <g className="limb-left">
                <path d="M35 80 Q25 95 15 85" stroke="#f472b6" strokeWidth="4" strokeLinecap="round" fill="none" />
                <circle cx="15" cy="85" r="4" fill="#fbcfe8" />
            </g>
            <g className="limb-right">
                <path d="M65 80 Q75 95 85 85" stroke="#f472b6" strokeWidth="4" strokeLinecap="round" fill="none" />
                <circle cx="85" cy="85" r="4" fill="#fbcfe8" />
            </g>

            {/* Brain Lobes */}
            <path d="M30 40 C10 40, 10 70, 30 80 C30 80, 50 90, 70 80 C90 70, 90 40, 70 40 C60 20, 40 20, 30 40 Z" fill="#fbcfe8" />
            <path d="M50 35 C50 35, 45 50, 50 85" stroke="#f472b6" strokeWidth="2" fill="none" />
            {/* Squiggles */}
            <path d="M25 50 Q30 45 35 55" stroke="#f472b6" strokeWidth="2" fill="none" />
            <path d="M65 50 Q70 45 75 55" stroke="#f472b6" strokeWidth="2" fill="none" />
            
            {/* Party Hat */}
            <g className="party-hat">
                <polygon points="35,40 65,40 50,5" fill="#a78bfa" />
                <circle cx="50" cy="5" r="6" fill="#fde047" />
                <path d="M35 40 L65 40 L50 5 Z" fill="url(#stripes)" opacity="0.3" />
            </g>

            <defs>
                <pattern id="stripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="5" height="10" fill="#fff" />
                </pattern>
            </defs>
            {/* Eyes */}
            <g className="eye-group origin-center">
                <circle cx="40" cy="60" r="3" fill="#831843" className="eye-open transition-opacity duration-300" />
                <circle cx="60" cy="60" r="3" fill="#831843" className="eye-open transition-opacity duration-300" />
                <path d="M35 60 Q40 65 45 60" stroke="#831843" strokeWidth="2" fill="none" className="eye-closed opacity-0 transition-opacity duration-300" />
                <path d="M55 60 Q60 65 65 60" stroke="#831843" strokeWidth="2" fill="none" className="eye-closed opacity-0 transition-opacity duration-300" />
            </g>
            {/* Mouth */}
            <path d="M45 70 Q50 75 55 70" stroke="#831843" strokeWidth="2.5" fill="none" className="mouth-smile transition-transform duration-300 origin-center" />
        </svg>
    );
}
