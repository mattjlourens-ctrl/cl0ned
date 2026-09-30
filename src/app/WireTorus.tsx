"use client";

import { useEffect, useRef } from "react";

// Decorative background for the hero: a wireframe torus made of thin rings,
// with a few particle dots around it, slowly rotating. Purely visual.

const RINGS = 36; // rings around the big circle
const POINTS_PER_RING = 48; // points that make up each ring
const PARTICLES = 140;

type Point3D = { x: number; y: number; z: number };

// A point on a torus with big radius 1 and tube radius 0.42.
function torusPoint(u: number, v: number): Point3D {
  const tube = 0.42;
  return {
    x: (1 + tube * Math.cos(v)) * Math.cos(u),
    y: tube * Math.sin(v),
    z: (1 + tube * Math.cos(v)) * Math.sin(u),
  };
}

// Random dots in a loose shell around the torus. Made once, so they rotate with it.
function makeParticles(): Point3D[] {
  const particles: Point3D[] = [];
  for (let i = 0; i < PARTICLES; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * Math.PI * 2;
    const spread = 1 + (Math.random() - 0.5) * 0.9;
    const p = torusPoint(u, v);
    particles.push({ x: p.x * spread, y: p.y * spread * 1.6, z: p.z * spread });
  }
  return particles;
}

export default function WireTorus({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const particles = makeParticles();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = width * ratio;
      canvas!.height = height * ratio;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // Rotate a point (spin around the vertical axis, fixed tilt towards the viewer),
    // then project it onto the canvas with simple perspective.
    function project(p: Point3D, spin: number) {
      const tilt = 1.1;
      const x1 = p.x * Math.cos(spin) - p.z * Math.sin(spin);
      const z1 = p.x * Math.sin(spin) + p.z * Math.cos(spin);
      const y2 = p.y * Math.cos(tilt) - z1 * Math.sin(tilt);
      const z2 = p.y * Math.sin(tilt) + z1 * Math.cos(tilt);
      const scale = Math.min(width, height * 1.6) * 0.42;
      const perspective = 3 / (3 + z2);
      return {
        x: width / 2 + x1 * scale * perspective,
        y: height / 2 + y2 * scale * perspective,
        depth: z2,
      };
    }

    function draw(time: number) {
      const spin = time * 0.00008;
      context!.clearRect(0, 0, width, height);
      context!.lineWidth = 0.6;

      for (let i = 0; i < RINGS; i++) {
        const u = (i / RINGS) * Math.PI * 2;
        context!.beginPath();
        for (let j = 0; j <= POINTS_PER_RING; j++) {
          const v = (j / POINTS_PER_RING) * Math.PI * 2;
          const p = project(torusPoint(u, v), spin);
          if (j === 0) context!.moveTo(p.x, p.y);
          else context!.lineTo(p.x, p.y);
        }
        // Rings further back are fainter, which gives the shape its depth.
        const back = project(torusPoint(u, 0), spin).depth;
        context!.strokeStyle = `rgba(255, 255, 255, ${0.2 - back * 0.07})`;
        context!.stroke();
      }

      for (const particle of particles) {
        const p = project(particle, spin);
        context!.fillStyle = `rgba(255, 255, 255, ${0.3 - p.depth * 0.1})`;
        context!.fillRect(p.x, p.y, 1.2, 1.2);
      }
    }

    function loop(time: number) {
      draw(time);
      frame = requestAnimationFrame(loop);
    }

    resize();
    if (reduceMotion) {
      draw(0);
    } else {
      frame = requestAnimationFrame(loop);
    }

    function handleResize() {
      resize();
      if (reduceMotion) draw(0);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
