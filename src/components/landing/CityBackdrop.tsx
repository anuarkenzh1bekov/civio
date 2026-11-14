"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/landing.module.css";

export function CityBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [allowMotion, setAllowMotion] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowMotion(!reducedMotion.matches);
    sync();
    reducedMotion.addEventListener("change", sync);
    return () => reducedMotion.removeEventListener("change", sync);
  }, []);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }

  return (
    <>
      <div className={styles.backdrop} aria-hidden="true">
        {allowMotion && !unavailable && (
          <video
            ref={videoRef}
            src="/landing/california-loop.mp4"
            poster="/landing/california-poster.webp"
            width={640}
            height={360}
            autoPlay
            muted
            playsInline
            loop
            disablePictureInPicture
            onPlaying={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => setUnavailable(true)}
          />
        )}
      </div>
      {allowMotion && !unavailable && (
        <button
          type="button"
          className={styles.motionControl}
          aria-label={isPlaying ? "Pause background video" : "Play background video"}
          title={isPlaying ? "Pause background video" : "Play background video"}
          onClick={togglePlayback}
        >
          {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
      )}
    </>
  );
}
