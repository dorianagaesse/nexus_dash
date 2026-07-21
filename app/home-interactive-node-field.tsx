"use client";

import { useEffect, useRef } from "react";

const NODE_COUNT = 208;
const CLUSTERED_NODE_COUNT = 112;
const CLUSTER_COUNT = 5;
const PLACEMENT_CANDIDATES = 24;
const WORLD_PADDING_X = 0.18;
const WORLD_PADDING_Y = 0.2;
const ACTIVATION_RADIUS = 340;
const MAX_ATTRACTION = 22;
const MAX_PARALLAX = 30;

type Point = { x: number; y: number };
type NodePoint = Point & {
  cluster: number | null;
  depth: number;
  emphasis: number;
};
type Link = {
  depth: number;
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

  const clusterAnchors = Array.from({ length: CLUSTER_COUNT }, (_, index) => {
    const edgeAnchors = [
      { x: -0.03 - random() * 0.06, y: 0.12 + random() * 0.36 },
      { x: 1.03 + random() * 0.06, y: 0.5 + random() * 0.34 },
      { x: 0.52 + random() * 0.3, y: 1.03 + random() * 0.07 },
      { x: 0.4 + random() * 0.2, y: 0.3 + random() * 0.3 },
    ];
    const position = edgeAnchors[index] ?? {
      x: 0.12 + random() * 0.76,
      y: 0.12 + random() * 0.76,
    };

    return {
      ...position,
      depth: 0.18 + random() * 0.76,
      radiusX: 0.1 + random() * 0.09,
      radiusY: 0.11 + random() * 0.1,
    };
  });

  const nodes: NodePoint[] = Array.from(
    { length: CLUSTERED_NODE_COUNT },
    (_, index) => {
      const cluster = index % CLUSTER_COUNT;
      const anchor = clusterAnchors[cluster];
      const angle = random() * Math.PI * 2;
      const radius = Math.pow(random(), 0.68);
      const depth = Math.max(
        0.04,
        Math.min(0.98, anchor.depth + (random() - 0.5) * 0.34)
      );

      return {
        x: anchor.x + Math.cos(angle) * anchor.radiusX * radius,
        y: anchor.y + Math.sin(angle) * anchor.radiusY * radius,
        cluster,
        depth,
        emphasis: 0.82 + depth * 0.44 + Math.pow(random(), 1.8) * 0.5,
      };
    }
  );

  while (nodes.length < NODE_COUNT) {
    let bestCandidate: NodePoint | null = null;
    let bestClearance = -1;

    for (let attempt = 0; attempt < PLACEMENT_CANDIDATES; attempt += 1) {
      const depth = 0.04 + random() * 0.94;
      const candidate = {
        x: -WORLD_PADDING_X + random() * (1 + WORLD_PADDING_X * 2),
        y: -WORLD_PADDING_Y + random() * (1 + WORLD_PADDING_Y * 2),
        cluster: null,
        depth,
        emphasis: 0.82 + depth * 0.44 + Math.pow(random(), 1.8) * 0.5,
      };
      const clearance = nodes.reduce(
        (nearest, node) =>
          Math.min(
            nearest,
            Math.hypot(
              (candidate.x - node.x) * 1.4,
              candidate.y - node.y,
              (candidate.depth - node.depth) * 0.18
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
    const distance = Math.hypot(
      (second.x - first.x) * 1.4,
      second.y - first.y,
      (second.depth - first.depth) * 0.38
    );
    const closeness = 1 - Math.min(1, distance / 0.27);
    const cellAffinity =
      ((first.emphasis + second.emphasis) / 2 - 0.82) / 0.94;
    const sharedNeighborhood =
      first.cluster !== null && first.cluster === second.cluster ? 1 : 0;
    const depth = (first.depth + second.depth) / 2;

    links.push({
      depth,
      from,
      to,
      strength: Math.min(
        1,
        0.08 +
          random() * 0.34 +
          closeness * 0.18 +
          cellAffinity * 0.12 +
          sharedNeighborhood * 0.2 +
          depth * 0.14
      ),
      bend: (random() * 2 - 1) * (0.32 + random() * 0.5),
    });
  };

  nodes.forEach((node, from) => {
    const neighbors = nodes
      .map((candidate, to) => ({
        to,
        distance: Math.hypot(
          (candidate.x - node.x) * 1.4,
          candidate.y - node.y,
          (candidate.depth - node.depth) * 0.38
        ),
      }))
      .filter(({ to }) => to !== from)
      .sort((left, right) => left.distance - right.distance)
      .slice(
        0,
        node.cluster !== null
          ? random() < 0.52
            ? 6
            : 5
          : random() < 0.42
            ? 5
            : 4
      );

    neighbors.forEach(({ to }) => connect(from, to));
  });

  links.sort((first, second) => first.depth - second.depth);
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
    canvas.dataset.layout = "neural-volume";
    canvas.dataset.strengthModel = "continuous";
    canvas.dataset.depthModel = "perspective";
    canvas.dataset.ambientNodes = String(NODE_COUNT - CLUSTERED_NODE_COUNT);

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

    const resolveNodes = () => {
      const cameraX = ((pointer.x / width) * 2 - 1) * activity;
      const cameraY = ((pointer.y / height) * 2 - 1) * activity;

      return nodeField.nodes.map((node) => {
        const perspective = 0.78 + node.depth * 0.42;
        const projectedX = 0.5 + (node.x - 0.5) * perspective;
        const projectedY = 0.5 + (node.y - 0.5) * perspective;
        const parallax = node.depth * MAX_PARALLAX;
        const baseX = projectedX * width - cameraX * parallax;
        const baseY = projectedY * height - cameraY * parallax;
        const distance = Math.hypot(pointer.x - baseX, pointer.y - baseY);
        const influence = proximityInfluence(distance) * activity;
        const directionX = distance > 0 ? (pointer.x - baseX) / distance : 0;
        const directionY = distance > 0 ? (pointer.y - baseY) / distance : 0;
        const attraction = Math.pow(influence, 1.35) * MAX_ATTRACTION;

        return {
          x: baseX + directionX * attraction,
          y: baseY + directionY * attraction,
          influence,
          depth: node.depth,
          emphasis: node.emphasis,
        };
      });
    };

    const draw = () => {
      frame = null;
      if (!desktop.matches) return;

      pointer.x += (target.x - pointer.x) * 0.16;
      pointer.y += (target.y - pointer.y) * 0.16;
      activity += (targetActivity - activity) * 0.14;

      context.clearRect(0, 0, width, height);
      const palette = colors();
      const resolvedNodes = resolveNodes();
      canvas.dataset.offscreenNodes = String(
        resolvedNodes.filter(
          (node) =>
            node.x < 0 || node.x > width || node.y < 0 || node.y > height
        ).length
      );

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
          palette.baseLinkAlpha * (0.3 + link.depth * 0.84) +
          link.strength * palette.strongLinkAlpha * (0.38 + link.depth * 0.82) +
          influence * palette.activeLinkAlpha * (0.62 + link.depth * 0.48);
        const depthGradient = context.createLinearGradient(
          from.x,
          from.y,
          to.x,
          to.y
        );
        depthGradient.addColorStop(
          0,
          `rgba(${palette.link}, ${Math.min(
            0.94,
            alpha * (0.5 + from.depth * 0.62)
          )})`
        );
        depthGradient.addColorStop(
          1,
          `rgba(${palette.link}, ${Math.min(
            0.94,
            alpha * (0.5 + to.depth * 0.62)
          )})`
        );
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.quadraticCurveTo(controlX, controlY, to.x, to.y);
        context.lineCap = "round";
        context.lineWidth =
          (0.22 + link.strength * 2.4) * (0.38 + link.depth * 1.22) +
          influence * (0.7 + link.strength * 0.9);
        context.strokeStyle = depthGradient;
        context.stroke();
      });

      resolvedNodes
        .map((node, index) => ({ ...node, index }))
        .sort((first, second) => first.depth - second.depth)
        .forEach((node) => {
        const depthPresence = 0.36 + node.depth * 0.82;
        const radius =
          (0.42 + node.depth * 2.75) * node.emphasis + node.influence * 2.1;
        const alpha =
          palette.baseNodeAlpha * depthPresence +
          node.influence * palette.activeNodeAlpha * (0.72 + node.depth * 0.38);
        context.shadowColor = `rgba(${palette.node}, ${
          node.depth * 0.16 + node.influence * 0.22
        })`;
        context.shadowBlur = node.depth * 8 + node.influence * 7;
        context.beginPath();
        context.arc(node.x, node.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${palette.node}, ${alpha})`;
        context.fill();
        context.shadowBlur = 0;

        const membraneAlpha =
          0.012 + node.depth * 0.065 + node.influence * 0.17;
        context.beginPath();
        context.arc(
          node.x,
          node.y,
          radius + 1.5 + node.depth * 2.7,
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
