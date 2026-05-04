import { useRef, useState } from "react";
import type { MediaAttachment } from "./question-bank.api.ts";
import { X } from "lucide-react";

interface Props {
    media: MediaAttachment[];
    onRemove: (index: number) => void;
}

export function MediaPreview({ media, onRemove }: Props) {
    return (
        <div className="qb-media-grid">
            {media.map((item, idx) => {
                if (item.media_type === "image") {
                    return (
                        <div key={idx} className="qb-media-card">
                            <img src={item.url} alt={item.file_name} loading="lazy" />
                            <button className="qb-media-card-remove" onClick={() => onRemove(idx)}><X size={14} strokeWidth={3} /></button>
                        </div>
                    );
                }
                if (item.media_type === "audio") {
                    return <MiniAudioPlayer key={idx} url={item.url} name={item.file_name} onRemove={() => onRemove(idx)} />;
                }
                if (item.media_type === "video") {
                    return (
                        <div key={idx} className="qb-media-card" style={{ width: 160, height: 100 }}>
                            <video src={item.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button className="qb-media-card-remove" onClick={() => onRemove(idx)}>✕</button>
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 24, opacity: 0.8 }}>▶</span>
                            </div>
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );
}

/* ── Mini Audio Player ── */
function MiniAudioPlayer({ url, onRemove }: { url: string; name?: string; onRemove: () => void }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const toggle = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setPlaying(!isPlaying);
    };

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    // Generate fake waveform bars
    const bars = Array.from({ length: 20 }, (_, i) => {
        const progress = duration > 0 ? currentTime / duration : 0;
        const barProgress = i / 20;
        return {
            height: 6 + Math.sin(i * 0.8) * 8 + Math.random() * 4,
            active: barProgress <= progress,
        };
    });

    return (
        <div className="qb-audio-player" style={{ position: "relative" }}>
            <audio
                ref={audioRef}
                src={url}
                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
                onEnded={() => setPlaying(false)}
            />
            <button className="qb-audio-btn" onClick={toggle}>{isPlaying ? "⏸" : "▶"}</button>
            <div className="qb-audio-wave">
                {bars.map((b, i) => (
                    <div
                        key={i}
                        className={`qb-audio-wave-bar ${b.active ? "active" : ""}`}
                        style={{ height: b.height }}
                    />
                ))}
            </div>
            <span className="qb-audio-time">{formatTime(currentTime)}</span>
            <button className="qb-media-card-remove" style={{ opacity: 1, position: "absolute", top: -6, right: -6 }} onClick={onRemove}>
                ✕
            </button>
        </div>
    );
}
