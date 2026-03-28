"use client";

import React, { useState, useRef, useEffect } from "react";

interface AudioPlayerProps {
  audioUrl: string;
  duration: number;
  isMe: boolean;
}

export default function AudioPlayer({ audioUrl, duration, isMe }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Check if audio is expired (20 minutes)
    checkExpiration();
    
    // Check expiration every minute
    const interval = setInterval(checkExpiration, 60000);
    return () => clearInterval(interval);
  }, [audioUrl]);

  const checkExpiration = () => {
    try {
      const parts = audioUrl.split("_");
      const timestampPart = parts[parts.length - 1];
      const timestamp = parseInt(timestampPart.replace(".m4a", ""), 10);
      
      if (!isNaN(timestamp)) {
        const twentyMinutes = 20 * 60 * 1000;
        if (Date.now() - timestamp > twentyMinutes) {
          setIsExpired(true);
        }
      }
    } catch (e) {
      // Ignore errors
    }
  };

  const togglePlay = () => {
    if (isExpired) return;
    
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });
      audioRef.current.addEventListener("timeupdate", () => {
        setCurrentTime(audioRef.current?.currentTime || 0);
      });
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  if (isExpired) {
    return (
      <span className={`text-xs italic ${isMe ? "text-white/60" : "text-zinc-400"}`}>
        🎤 Voice message expired
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <button
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
          isMe ? "bg-white/20 hover:bg-white/30" : "bg-black/10 hover:bg-black/20"
        }`}
      >
        {isPlaying ? "⏸" : "▶️"}
      </button>
      
      <div className="flex-1">
        <div className={`h-1.5 rounded-full ${isMe ? "bg-white/20" : "bg-black/10"}`}>
          <div
            className={`h-full rounded-full ${isMe ? "bg-white" : "bg-blue-500"}`}
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      </div>
      
      <span className={`text-xs ${isMe ? "text-white/80" : "text-zinc-500"}`}>
        {formatTime(currentTime)}
      </span>
    </div>
  );
}
