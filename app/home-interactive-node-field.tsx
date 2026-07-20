"use client";

import { useEffect, useRef } from "react";

const NODE_COUNT = 96;
const PLACEMENT_CANDIDATES = 36;
const ACTIVATION_RADIUS = 340;
const MAX_ATTRACTION = 22;

type Point = { x: number; y: number };
type NodePoint = Point & { emphasis: number };
type Link = {
  from: number;
  to: number;
  strength: number;
  bend: number;
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
    let bestCandidate: NodePoint | null = null;
    let bestClearance = -1;

    for (let attempt = 0; attempt < PLACEMENT_CANDIDATES; attempt += 1) {
      const candidate = {
        x: 0.025 + random() * 0.95,
        y: 0.04 + random() * 0.92,
        emphasis: 0.92 + Math.pow(random(), 1.65) * 0.68,
      };
      const clearance = nodes.reduce(
        (nearest, node) =>
          Math.min(
            nearest,
            Math.hypot(
              (candidate.x - node.x) * 1.4,
              candidate.y - node.y
            )
          ),
        Number.POSITIVE_INFINITY
      );

      if (clearance > bestClearance) {
        bestCandidate = candidate;
        bestClearance = clearance;
      }
    }

    if (bestCandidate) nodes.push(bestCandidate);
  }

  const linkKeys = new Set<string>();
  const links: Link[] = [];

  const connect = (from: number, to: number) => {
    if (to < 0 || to >= nodes.length || from === to) return;
    const key = [from, to].sort((a, b) => a - b).join(":");
    if (linkKeys.has(key)) return;
    linkKeys.add(key);

    const first = nodes[from];
    const second = nodes[to];
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const closeness = 1 - Math.min(1, distance / 0.19);
    const cellAffinity =
      ((first.emphasis + second.emphasis) / 2 - 0.92) / 0.68;

    links.push({
      from,
      to,
      strength: Math.min(
        0.98,
        0.14 + random() * 0.46 + closeness * 0.2 + cellAffinity * 0.18
      ),
      bend: (random() * 2 - 1) * (0.35 + random() * 0.35),
    });
  };

  nodes.forEach((node, from) => {
    const neighbors = nodes
      .map((candidate, to) => ({
        to,
        distance: Math.hypot(
          (candidate.x - node.x) * 1.4,
          candidate.y - node.y
        ),
      }))
      .filter(({ to }) => to !== from)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, random() < 0.48 ? 4 : 3);

    neighbors.forEach(({ to }) => connect(from, to));
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
      nodeField.links.filter((link) => link.strength >= 0.72).length
    );
    canvas.dataset.layout = "balanced-neural";
    canvas.dataset.strengthModel = "continuous";

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
        const deltaX = to.x - from.x;
        const deltaY = to.y - from.y;
        const linkLength = Math.hypot(deltaX, deltaY);
        const bendAmount = Math.min(linkLength * 0.16, 22) * link.bend;
        const controlX =
          (from.x + to.x) / 2 -
          (linkLength > 0 ? deltaY / linkLength : 0) * bendAmount;
        const controlY =
          (from.y + to.y) / 2 +
          (linkLength > 0 ? deltaX / linkLength : 0) * bendAmount;
        const midpointDistance = Math.hypot(
          pointer.x - controlX,
          pointer.y - controlY
        );
        const midpointInfluence = proximityInfluence(midpointDistance) * activity;
        const influence =
          Math.max(from.influence, to.influence) * 0.62 +
          midpointInfluence * 0.38;
        const alpha =
          palette.baseLinkAlpha +
          link.strength * palette.strongLinkAlpha +
          influence * palette.activeLinkAlpha;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.quadraticCurveTo(controlX, controlY, to.x, to.y);
        context.lineCap = "round";
        context.lineWidth =
          0.58 + link.strength * 1.45 + influence * (0.78 + link.strength * 0.58);
        context.strokeStyle = `rgba(${palette.link}, ${Math.min(0.94, alpha)})`;
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

        const membraneAlpha =
          0.025 + (node.emphasis - 0.92) * 0.07 + node.influence * 0.16;
        context.beginPath();
        context.arc(
          node.x,
          node.y,
          radius + 2.2 + node.emphasis * 0.7,
          0,
          Math.PI * 2
        );
        context.strokeStyle = `rgba(${palette.node}, ${membraneAlpha})`;
        context.lineWidth = 0.7 + node.influence * 0.45;
        context.stroke();

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
