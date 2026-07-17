"use client";

import { useEffect, useRef } from "react";

const NODE_COUNT = 54;
const ACTIVATION_RADIUS = 240;
const MAX_ATTRACTION = 18;

type Point = { x: number; y: number };
type NodePoint = Point & { emphasis: number };
type Link = { from: number; to: number; weight: number };

function createNodeField() {
  let seed = 129;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const nodes = Array.from({ length: NODE_COUNT }, (_, index): NodePoint => ({
    x: 0.025 + random() * 0.95,
    y: 0.04 + random() * 0.92,
    emphasis: index % 11 === 0 ? 1.45 : index % 5 === 0 ? 1.2 : 1,
  }));
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
      .slice(0, from % 4 === 0 ? 3 : 2);

    neighbors.forEach(({ to }) => {
      const key = [from, to].sort((a, b) => a - b).join(":");
      if (linkKeys.has(key)) return;
      linkKeys.add(key);
      links.push({
        from,
        to,
        weight:
          (from + to) % 9 === 0 ? 2.4 : (from + to) % 4 === 0 ? 1.45 : 0.8,
      });
    });
  });

  return { nodes, links };
}

const nodeField = createNodeField();

export function HomeInteractiveNodeField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

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
            haloInner: "rgba(59, 130, 246, 0.18)",
            haloOuter: "rgba(79, 70, 229, 0)",
            link: "129, 140, 248",
            node: "147, 197, 253",
          }
        : {
            haloInner: "rgba(37, 99, 235, 0.13)",
            haloOuter: "rgba(99, 102, 241, 0)",
            link: "37, 99, 235",
            node: "29, 78, 216",
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
        const influence =
          Math.max(0, 1 - distance / ACTIVATION_RADIUS) * activity;
        const directionX = distance > 0 ? (pointer.x - baseX) / distance : 0;
        const directionY = distance > 0 ? (pointer.y - baseY) / distance : 0;
        const attraction = influence * influence * MAX_ATTRACTION;

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
          ACTIVATION_RADIUS * 1.35
        );
        halo.addColorStop(0, palette.haloInner);
        halo.addColorStop(1, palette.haloOuter);
        context.fillStyle = halo;
        context.fillRect(0, 0, width, height);
      }

      nodeField.links.forEach((link) => {
        const from = resolvedNodes[link.from];
        const to = resolvedNodes[link.to];
        const influence = Math.max(from.influence, to.influence);
        const alpha = 0.095 + influence * 0.5;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.lineWidth = link.weight + influence * 0.75;
        context.strokeStyle = `rgba(${palette.link}, ${alpha})`;
        context.stroke();
      });

      resolvedNodes.forEach((node) => {
        const radius = 1.35 * node.emphasis + node.influence * 1.9;
        const alpha = 0.24 + node.influence * 0.7;
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
