"use client";

import { useEffect, useRef } from "react";

const RESTING_TRANSFORM = "translate3d(0, 0, 0) scale(1.04)";

export function HomeResponsiveSpotlight() {
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spotlight = spotlightRef.current;
    if (!spotlight) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const precisePointer = window.matchMedia("(pointer: fine)");
    if (reducedMotion.matches || !precisePointer.matches) {
      return;
    }

    let animationFrame: number | null = null;

    const updateSpotlight = (event: PointerEvent) => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        const horizontalProgress = event.clientX / window.innerWidth - 0.5;
        const verticalProgress = event.clientY / window.innerHeight - 0.5;
        spotlight.style.transform = `translate3d(${horizontalProgress * 9}vw, ${verticalProgress * 7}vh, 0) scale(1.04)`;
        animationFrame = null;
      });
    };

    const resetSpotlight = () => {
      spotlight.style.transform = RESTING_TRANSFORM;
    };

    window.addEventListener("pointermove", updateSpotlight, { passive: true });
    document.documentElement.addEventListener("mouseleave", resetSpotlight);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("pointermove", updateSpotlight);
      document.documentElement.removeEventListener("mouseleave", resetSpotlight);
    };
  }, []);

  return (
    <div
      ref={spotlightRef}
      className="home-responsive-spotlight pointer-events-none absolute hidden lg:block"
      aria-hidden="true"
    />
  );
}
