"use client";

import { useEffect, useRef } from "react";

const NODE_COUNT = 64;
const ACTIVATION_RADIUS = 340;
const MAX_ATTRACTION = 22;
const MIN_NODE_DISTANCE = 0.064;

type Point = { x: number; y: number };
type NodePoint = Point & { emphasis: number };
type Link = {
  from: number;
  to: number;
  prominence: number;
  weight: number;
};

function createRandomSeed() {
  try {
    const seed = new Uint32Array(1);
    window.crypto.getRandomValues(seed);
    return seed[0] || Date.now();
  } catch {
    return Math.floor(Math.random() * 4_294_967_295) || Date.now();
  }
}

function createNodeField(seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const nodes: NodePoint[] = [];
  while (nodes.length < NODE_COUNT) {
    let candidate: NodePoint | null = null;

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const emphasisRoll = random();
      const proposed = {
        x: 0.025 + random() * 0.95,
        y: 0.04 + random() * 0.92,
        emphasis: emphasisRoll < 0.12 ? 1.5 : emphasisRoll < 0.32 ? 1.2 : 1,
      };
      const relaxedDistance = MIN_NODE_DISTANCE * (attempt > 80 ? 0.72 : 1);
      const clearsNeighbors = nodes.every((node) =>
        Math.hypot(
          (proposed.x - node.x) * 1.15,
          proposed.y - node.y
        ) > relaxedDistance
      );

      if (clearsNeighbors) {
        candidate = proposed;
        break;
      }
    }

    nodes.push(
      candidate ?? {
        x: 0.025 + random() * 0.95,
        y: 0.04 + random() * 0.92,
        emphasis: 1,
      }
    );
  }

  const linkKeys = new Set<string>();
  const links: Link[] = [];

  nodes.forEach((node, from) => {
    const neighbors = nodes
      .map((candidate, to) => ({
        to,
        distance: Math.hypot(candidate.x - node.x, candidate.y - node.y),
      }))
      .filter(({ to }) => to !== from)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, random() < 0.2 ? 4 : 3);

    neighbors.forEach(({ to }) => {
      const key = [from, to].sort((a, b) => a - b).join(":");
      if (linkKeys.has(key)) return;
      linkKeys.add(key);
      const prominenceRoll = random();
      const prominence =
        links.length % 7 === 0 || prominenceRoll < 0.12
          ? 1
          : prominenceRoll < 0.42
            ? 0.45
            : 0;
      links.push({
        from,
        to,
        prominence,
        weight: 0.75 + prominence * 1.65,
      });
    });
  });

  return { nodes, links };
}

function smootherStep(progress: number) {
  const value = Math.max(0, Math.min(1, progress));
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function proximityInfluence(distance: number) {
  return 1 - smootherStep(distance / ACTIVATION_RADIUS);
}

export function HomeInteractiveNodeField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const seed = createRandomSeed();
    const nodeField = createNodeField(seed);
    canvas.dataset.constellationSeed = String(seed);
    canvas.dataset.nodeCount = String(nodeField.nodes.length);
    canvas.dataset.linkCount = String(nodeField.links.length);
    canvas.dataset.strongLinks = String(
      nodeField.links.filter((link) => link.prominence === 1).length
    );

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1024px)");
    const precisePointer = window.matchMedia("(pointer: fine)");
    const pointer = {
      x: window.innerWidth * 0.3,
      y: window.innerHeight * 0.42,
    };
    const target = { ...pointer };
    let activity = 0;
    let targetActivity = 0;
    let frame: number | null = null;
    let width = 0;
    let height = 0;

    const colors = () => {
      const dark = document.documentElement.classList.contains("dark");
      return dark
        ? {
            haloInner: "rgba(59, 130, 246, 0.2)",
            haloMiddle: "rgba(79, 70, 229, 0.085)",
            haloEdge: "rgba(79, 70, 229, 0.018)",
            link: "129, 140, 248",
            node: "147, 197, 253",
            baseLinkAlpha: 0.075,
            activeLinkAlpha: 0.48,
            strongLinkAlpha: 0.085,
            baseNodeAlpha: 0.24,
            activeNodeAlpha: 0.7,
          }
        : {
            haloInner: "rgba(37, 99, 235, 0.18)",
            haloMiddle: "rgba(79, 70, 229, 0.075)",
            haloEdge: "rgba(99, 102, 241, 0.018)",
            link: "29, 78, 216",
            node: "30, 64, 175",
            baseLinkAlpha: 0.105,
            activeLinkAlpha: 0.56,
            strongLinkAlpha: 0.12,
            baseNodeAlpha: 0.31,
            activeNodeAlpha: 0.66,
          };
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const resolveNodes = () =>
      nodeField.nodes.map((node) => {
        const baseX = node.x * width;
        const baseY = node.y * height;
        const distance = Math.hypot(pointer.x - baseX, pointer.y - baseY);
        const influence = proximityInfluence(distance) * activity;
        const directionX = distance > 0 ? (pointer.x - baseX) / distance : 0;
        const directionY = distance > 0 ? (pointer.y - baseY) / distance : 0;
        const attraction = Math.pow(influence, 1.35) * MAX_ATTRACTION;

        return {
          x: baseX + directionX * attraction,
          y: baseY + directionY * attraction,
          influence,
          emphasis: node.emphasis,
        };
      });

    const draw = () => {
      frame = null;
      if (!desktop.matches) return;

      pointer.x += (target.x - pointer.x) * 0.16;
      pointer.y += (target.y - pointer.y) * 0.16;
      activity += (targetActivity - activity) * 0.14;

      context.clearRect(0, 0, width, height);
      const palette = colors();
      const resolvedNodes = resolveNodes();

      if (activity > 0.01) {
        const halo = context.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          ACTIVATION_RADIUS * 1.12
        );
        halo.addColorStop(0, palette.haloInner);
        halo.addColorStop(0.38, palette.haloMiddle);
        halo.addColorStop(0.76, palette.haloEdge);
        halo.addColorStop(1, "rgba(99, 102, 241, 0)");
        context.fillStyle = halo;
        context.fillRect(0, 0, width, height);
      }

      nodeField.links.forEach((link) => {
        const from = resolvedNodes[link.from];
        const to = resolvedNodes[link.to];
        const midpointDistance = Math.hypot(
          pointer.x - (from.x + to.x) / 2,
          pointer.y - (from.y + to.y) / 2
        );
        const midpointInfluence = proximityInfluence(midpointDistance) * activity;
        const influence =
          Math.max(from.influence, to.influence) * 0.62 +
          midpointInfluence * 0.38;
        const alpha =
          palette.baseLinkAlpha +
          link.prominence * palette.strongLinkAlpha +
          influence * palette.activeLinkAlpha;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.lineWidth = link.weight + influence * (0.85 + link.prominence * 0.45);
        context.strokeStyle = `rgba(${palette.link}, ${alpha})`;
        context.stroke();
      });

      resolvedNodes.forEach((node) => {
        const radius = 1.35 * node.emphasis + node.influence * 1.9;
        const alpha =
          palette.baseNodeAlpha + node.influence * palette.activeNodeAlpha;
        context.beginPath();
        context.arc(node.x, node.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${palette.node}, ${alpha})`;
        context.fill();

        if (node.influence > 0.2) {
          context.beginPath();
          context.arc(
            node.x,
            node.y,
            radius + 5 * node.influence,
            0,
            Math.PI * 2
          );
          context.strokeStyle = `rgba(${palette.node}, ${node.influence * 0.24})`;
          context.lineWidth = 1;
          context.stroke();
        }
      });

      const unsettled =
        Math.abs(target.x - pointer.x) > 0.3 ||
        Math.abs(target.y - pointer.y) > 0.3 ||
        Math.abs(targetActivity - activity) > 0.01;
      if (unsettled && !reducedMotion.matches)
        frame = window.requestAnimationFrame(draw);
    };

    const requestDraw = () => {
      if (frame === null) frame = window.requestAnimationFrame(draw);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches || !precisePointer.matches || !desktop.matches)
        return;
      target.x = event.clientX;
      target.y = event.clientY;
      targetActivity = 1;
      canvas.dataset.active = "true";
      requestDraw();
    };

    const handlePointerLeave = () => {
      targetActivity = 0;
      canvas.dataset.active = "false";
      requestDraw();
    };

    const handleResize = () => {
      resize();
      requestDraw();
    };

    const handleMotionChange = () => {
      targetActivity = 0;
      activity = 0;
      canvas.dataset.interactive = reducedMotion.matches ? "false" : "true";
      canvas.dataset.active = "false";
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      draw();
    };

    const themeObserver = new MutationObserver(requestDraw);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    resize();
    canvas.dataset.interactive = reducedMotion.matches ? "false" : "true";
    draw();
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    document.documentElement.addEventListener("mouseleave", handlePointerLeave);
    window.addEventListener("resize", handleResize, { passive: true });
    reducedMotion.addEventListener("change", handleMotionChange);
    desktop.addEventListener("change", handleResize);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      themeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener(
        "mouseleave",
        handlePointerLeave
      );
      window.removeEventListener("resize", handleResize);
      reducedMotion.removeEventListener("change", handleMotionChange);
      desktop.removeEventListener("change", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="home-interactive-node-field pointer-events-none absolute inset-0 hidden lg:block"
      data-active="false"
      data-interactive="true"
      aria-hidden="true"
    />
  );
}
