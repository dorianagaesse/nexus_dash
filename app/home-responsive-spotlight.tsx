"use client";

import { useEffect, useRef } from "react";

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
        spotlight.style.setProperty(
          "--home-primary-x",
          `${horizontalProgress * 104}px`
        );
        spotlight.style.setProperty(
          "--home-primary-y",
          `${verticalProgress * 84}px`
        );
        spotlight.style.setProperty(
          "--home-secondary-x",
          `${horizontalProgress * 80}px`
        );
        spotlight.style.setProperty(
          "--home-secondary-y",
          `${verticalProgress * 96}px`
        );
        spotlight.style.setProperty("--home-primary-scale", "1.035");
        spotlight.style.setProperty("--home-secondary-scale", "1.055");
        spotlight.dataset.active = "true";
        animationFrame = null;
      });
    };

    const resetSpotlight = () => {
      spotlight.style.setProperty("--home-primary-x", "0px");
      spotlight.style.setProperty("--home-primary-y", "0px");
      spotlight.style.setProperty("--home-secondary-x", "0px");
      spotlight.style.setProperty("--home-secondary-y", "0px");
      spotlight.style.setProperty("--home-primary-scale", "1");
      spotlight.style.setProperty("--home-secondary-scale", "1");
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
    >
      <span className="home-responsive-spotlight-primary" />
      <span className="home-responsive-spotlight-secondary" />
    </div>
  );
}
