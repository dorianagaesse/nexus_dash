"use client";

import { useEffect, useRef } from "react";

const RESTING_TRANSFORM =
  "translate3d(24vw, 42vh, 0) translate3d(-50%, -50%, 0) scale(1)";

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
        spotlight.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate3d(-50%, -50%, 0) scale(1.08)`;
        spotlight.dataset.active = "true";
        animationFrame = null;
      });
    };

    const resetSpotlight = () => {
      spotlight.style.transform = RESTING_TRANSFORM;
      spotlight.dataset.active = "false";
    };

    window.addEventListener("pointermove", updateSpotlight, { passive: true });
    document.documentElement.addEventListener("mouseleave", resetSpotlight);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("pointermove", updateSpotlight);
      document.documentElement.removeEventListener(
        "mouseleave",
        resetSpotlight
      );
    };
  }, []);

  return (
    <div
      ref={spotlightRef}
      className="home-responsive-spotlight pointer-events-none absolute hidden lg:block"
      data-active="false"
      aria-hidden="true"
    />
  );
}
