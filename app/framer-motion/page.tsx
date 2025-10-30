'use client';

import * as React from 'react';
import { motion, useScroll, useTransform, MotionValue, useReducedMotion, useMotionValue } from 'framer-motion';

/* =========================================================
   Types
========================================================= */
type CarouselItem = { title: string; description: string };

type SemiCircleProps = {
  items: CarouselItem[];
  /** Radius of the circle in px (half of the square canvas width) */
  radius?: number; // default 420
  /** Stroke color and width for the arc */
  arcStroke?: string; // default '#1F2937' (neutral-800)
  arcStrokeWidth?: number; // default 12
  /** Start/end angles (deg) for the visible right semicircle sweep */
  startAngle?: number; // default 90  (top)
  endAngle?: number;   // default -90 (bottom)
  /** Scroll pacing: vh per item (pin height = items.length * pinVHPerItem) */
  pinVHPerItem?: number; // default 28
  /** Multiply the sweep angle (180° * sweepMultiplier). Use >1 to allow all items to reach center */
  sweepMultiplier?: number; // default 1
  /** Orbit direction of items along the arc */
  orbitDirection?: 'cw' | 'ccw';
  /** Starting offset in degrees applied before scroll (positive = clockwise) */
  initialAngleOffset?: number; // default 0
  /** Text orientation along the tangent: 'cw' | 'ccw' | 'upright' */
  textDirection?: 'cw' | 'ccw' | 'upright';
  /** Extra rotation offset applied to text orientation (degrees) */
  textRotateOffset?: number; // default 0
  /** Extra outward distance (px) for content cards from the arc radius */
  contentRadiusOffset?: number; // default 160
  /** Horizontal scale for content 'left' position (e.g., 2 doubles distance to the right) */
  contentLeftScale?: number; // default 1
  /** Center the first content card at screen center on load (horizontal) */
  centerContentAtStart?: boolean; // default false
  /** Extra classes */
  className?: string;
  textClassName?: string;
  /** Additional horizontal nudge to the right as a fraction of semicircle width (0..1) */
  rightNudgePct?: number; // default 0.12
};

/* =========================================================
   Math helpers
========================================================= */
const deg2rad = (deg: number) => (deg * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const normalizeAngle = (deg: number) => {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
};

/* =========================================================
   Label item (uses transforms derived from angleOffset)
========================================================= */
function ArcLabel({
  index,
  n,
  radius,
  cx,
  cy,
  baseAngle,
  angleOffset,
  isReduced,
  textDirection,
  textRotateOffset,
  textClassName,
}: {
  index: number;
  n: number;
  radius: number;
  cx: number;
  cy: number;
  baseAngle: number;
  angleOffset: MotionValue<number>;
  isReduced: boolean;
  textDirection: 'cw' | 'ccw' | 'upright';
  textRotateOffset: number;
  textClassName?: string;
}) {
  // Current angle for this label (deg), animated by scroll
  const angleDeg = useTransform(angleOffset, (off) => baseAngle + off);
  // Cartesian position in the local SVG/canvas coordinate system
  const x = useTransform(angleDeg, (a) => cx + radius * Math.cos(deg2rad(a)));
  const y = useTransform(angleDeg, (a) => cy + radius * Math.sin(deg2rad(a)));

  // Text orientation: along tangent CW/CCW or keep upright
  const rotCW = useTransform(angleDeg, (a) => a + 90 + textRotateOffset);
  const rotCCW = useTransform(angleDeg, (a) => a - 90 + textRotateOffset);
  const rot: MotionValue<number> | number =
    textDirection === 'upright' ? textRotateOffset : textDirection === 'cw' ? rotCW : rotCCW;

  // Active strength based on proximity to the rightmost point (0°)
  const strength = useTransform(angleDeg, (a) => {
    const dist = Math.abs(((normalizeAngle(a) + 180) % 360) - 180); // [0..180]
    const s = 1 - Math.min(dist / 90, 1); // 1 near 0°, -> 0 by ±90°
    return s;
  });

  const opacity = useTransform(strength, (s) => lerp(0.25, 1, s));
  const scale = useTransform(strength, (s) => lerp(0.92, 1, s));

  // Reduced motion handled upstream by providing a zero MotionValue driver.

  return (
    <motion.li
      className="absolute will-change-transform"
      style={{
        left: x,
        top: y,
        translateX: '-50%',
        translateY: '-50%',
        rotate: rot,
        opacity: isReduced ? 1 : opacity,
        scale: isReduced ? 1 : scale,
      }}
      aria-current={false}
    >
      {/* Marker only (no left-panel text). Adjust size/color as desired. */}
      <span
        className="block h-2.5 w-2.5 rounded-full bg-neutral-400 shadow-[0_0_10px_rgba(255,255,255,0.06)]"
        title={`Item ${index + 1}`}
      />
    </motion.li>
  );
}

/* =========================================================
   SemiCircleCarousel component
========================================================= */
function SemiCircleCarousel({
  items,
  radius = 420,
  arcStroke = '#1F2937',
  arcStrokeWidth = 12,
  startAngle = 90,
  endAngle = -90,
  pinVHPerItem = 28,
  sweepMultiplier = 1,
  orbitDirection = 'cw',
  initialAngleOffset = 0,
  textDirection = 'ccw',
  textRotateOffset = 0,
  contentRadiusOffset = 160,
  contentLeftScale = 1,
  centerContentAtStart = false,
  className,
  textClassName,
  rightNudgePct = 0.12,
}: SemiCircleProps) {
  const isReduced = useReducedMotion();

  const pinRef = React.useRef<HTMLDivElement | null>(null);
  const stickyRef = React.useRef<HTMLDivElement | null>(null);

  // Dynamically size the visible semicircle to 36% of the viewport width
  const [vw, setVw] = React.useState<number | null>(null);
  React.useEffect(() => {
    const onResize = () => setVw(window.innerWidth || 0);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const R = vw ? Math.round(vw * 0.36) : radius; // effective radius = 36vw (fallback to prop before mount)

  // Scroll progress that starts only once the pinned wrapper reaches the top of the viewport
  // This ensures we "start changing" items only when fully scrolled to the component.
  const { scrollYProgress } = useScroll({
    target: pinRef,
    offset: ['start start', 'end start'],
  });

  // One sweep across the visible right semicircle (180°) scaled by sweepMultiplier
  const sweep = Math.abs(endAngle - startAngle); // base 180
  const totalSweep = sweep * Math.max(1, sweepMultiplier);
  const angleOffsetBase = useTransform(scrollYProgress, [0, 1], [0, totalSweep]);
  const signed = useTransform(angleOffsetBase, (v) => (orbitDirection === 'ccw' ? -v : v));
  const angleOffset = useTransform(signed, (v) => v + initialAngleOffset);
  // Provide a non-animating driver for reduced motion so children can always rely on a MotionValue
  const zeroMV = useMotionValue(initialAngleOffset);
  const angleDriver = isReduced ? zeroMV : angleOffset;

  // local canvas coordinates: we draw a full circle centered at (r,r)
  // then position the canvas left by -r so the vertical diameter hugs the viewport's left edge.
  const canvasSize = R * 2;
  const cx = R;
  const cy = R;

  const totalPinHeight = Math.max(items.length, 2) * pinVHPerItem * Math.max(1, sweepMultiplier); // in vh

  // Precompute base angles for N items evenly spaced along the 180° arc
  const n = Math.max(items.length, 2);
  const baseAngles = items.map((_, i) => lerp(startAngle, endAngle, n === 1 ? 0 : i / (n - 1)));
  const contentRadius = R + contentRadiusOffset;
  // Optional horizontal centering for the first card at start
  const contentXOffset = useMotionValue(0);
  React.useEffect(() => {
    const update = () => {
      if (!centerContentAtStart) {
        contentXOffset.set(0);
        return;
      }
      const vw = window.innerWidth || 0;
      // At angle 0°, x_in_parent = contentRadius; shift so it lands at vw/2
      const offset = vw / 2 - contentRadius;
      // Nudge items more to the right so they sit further from the arc
      const contentRightNudge = Math.round(R * rightNudgePct);
      contentXOffset.set(offset + contentRightNudge);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [centerContentAtStart, contentRadius, contentXOffset, R, rightNudgePct]);

  return (
    <section
      className={['w-full bg-neutral-950 text-neutral-200', className ?? ''].join(' ')}
      style={{ minHeight: '100vh' }}
    >
      {/* Spacer before to make the pin effect clear */}
      <div className="h-[100vh] flex items-center justify-center text-neutral-500">
        <p className="text-sm uppercase tracking-widest">Scroll down</p>
      </div>

      {/* Pinned region wrapper (height in vh so pacing is consistent) */}
      <div ref={pinRef} style={{ height: `${totalPinHeight}vh` }} className="relative">
        {/* Sticky viewport */}
  <div ref={stickyRef} className="sticky top-0 h-screen overflow-hidden">
          <div className="relative h-full w-full isolate">
            {/* Single-panel layout: arc + orbiting content share the same left-axis */}
            <div className="absolute inset-0">
              {/* Canvas for arc and labels positioned so the vertical diameter hugs the left edge */}
              <div
                className="absolute top-1/2 -translate-y-1/2"
                // Keep the vertical diameter attached to the left edge by shifting the canvas left by -R
                style={{ width: canvasSize, height: canvasSize, left: -R }}
              >
                {/* ARC SVG */}
                <svg
                  className="absolute inset-0 z-20 pointer-events-none mix-blend-normal overflow-visible"
                  width={canvasSize}
                  height={canvasSize}
                  viewBox={`0 0 ${canvasSize} ${canvasSize}`}
                  aria-hidden
                >
                  {/* Removed faint background circle to avoid dark overlap on the arc */}
                  {/* Visible right semi accent */}
                  <path
                    d={describeArc(cx, cy, R - arcStrokeWidth / 2, startAngle, endAngle)}
                    fill="none"
                    stroke={arcStroke}
                    strokeWidth={arcStrokeWidth}
                    strokeLinecap="round"
                  />
                  {/* Removed rightmost tick to avoid any visual overlap on the arc */}
                </svg>

                {/* Labels UL (markers only) */}
                <ul className="absolute inset-0 z-20 pointer-events-none" aria-hidden="true">
                  {items.map((it, i) => {
                    const base = baseAngles[i];
                    return (
                      <ArcLabel
                        key={i}
                        index={i}
                        n={n}
                        radius={R}
                        cx={cx}
                        cy={cy}
                        baseAngle={base}
                        angleOffset={angleDriver}
                        isReduced={!!isReduced}
                        textDirection={textDirection}
                        textRotateOffset={textRotateOffset}
                        textClassName={textClassName}
                      />
                    );
                  })}
                </ul>

                {/* Content UL: orbiting cards placed at a larger radius so they're far from the arc */}
                <motion.div className="absolute inset-0 z-30" style={{ x: contentXOffset }}>
                  <ul className="absolute inset-0" aria-hidden="true">
                    {items.map((it, i) => {
                      const base = baseAngles[i];
                      return (
                        <ArcContent
                          contentRadius={contentRadius}
                          contentLeftScale={contentLeftScale}
                          cx={cx}
                          cy={cy}
                          baseAngle={base}
                          angleOffset={angleDriver}
                          isReduced={!!isReduced}
                          textDirection={textDirection}
                          textRotateOffset={textRotateOffset}
                          title={it.title}
                          description={it.description}
                        />
                      );
                    })}
                  </ul>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Screen-reader friendly, non-animated list of items */}
      <div className="sr-only" aria-live="polite">
        <h2>Carousel items</h2>
        <ul>
          {items.map((it, i) => (
            <li key={`sr-${i}`}>
              <span>{it.title}: </span>
              <span>{it.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* After-section to show release */}
      <div className="h-[120vh] flex items-center justify-center">
        <p className="text-neutral-400">Normal scroll resumes…</p>
      </div>
    </section>
  );
}

/* Rotating item card rendered on the shared left-axis; uses a larger radius to stay away from the arc */
function ArcContent({
  contentRadius,
  contentLeftScale,
  cx,
  cy,
  baseAngle,
  angleOffset,
  isReduced,
  textDirection,
  textRotateOffset,
  title,
  description,
}: {
  contentRadius: number;
  contentLeftScale: number;
  cx: number;
  cy: number;
  baseAngle: number;
  angleOffset: MotionValue<number>;
  isReduced: boolean;
  textDirection: 'cw' | 'ccw' | 'upright';
  textRotateOffset: number;
  title: string;
  description: string;
}) {
  const angleDeg = useTransform(angleOffset, (off) => baseAngle + off);
  const xBase = useTransform(angleDeg, (a) => cx + contentRadius * Math.cos(deg2rad(a)));
  const x = useTransform(xBase, (v) => v * contentLeftScale);
  const y = useTransform(angleDeg, (a) => cy + contentRadius * Math.sin(deg2rad(a)));
  const rotCW = useTransform(angleDeg, (a) => a + 90 + textRotateOffset);
  const rotCCW = useTransform(angleDeg, (a) => a - 90 + textRotateOffset);
  const rot: MotionValue<number> | number =
    textDirection === 'upright' ? textRotateOffset : textDirection === 'cw' ? rotCW : rotCCW;

  // Emphasis for smooth fade-in/out near rightmost point
  const strength = useTransform(angleDeg, (a) => {
    const dist = Math.abs(((normalizeAngle(a) + 180) % 360) - 180);
    return 1 - Math.min(dist / 90, 1);
  });
  const opacity = useTransform(strength, (s) => lerp(0.2, 1, s));
  const scale = useTransform(strength, (s) => lerp(0.95, 1, s));

  return (
    <motion.li
      className="absolute will-change-transform"
      style={{
        left: x,
        top: y,
        translateX: '-50%',
        translateY: '-50%',
        rotate: rot,
        opacity: isReduced ? 1 : opacity,
        scale: isReduced ? 1 : scale,
      }}
    >
      <div className="pointer-events-none select-none w-[28rem] md:w-[36rem]">
        <div className="text-sm font-semibold tracking-wider text-neutral-400 uppercase">{title}</div>
        <div className="mt-3 text-2xl md:text-3xl font-medium leading-tight text-neutral-100">{description}</div>
      </div>
    </motion.li>
  );
}

// Removed RightPanelItem to avoid conditional hook execution and unused code

/* =========================================================
   SVG arc helper: describe arc path (large-arc flags etc.)
========================================================= */
function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = deg2rad(deg);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, start: number, end: number) {
  const startPt = polarToCartesian(cx, cy, r, start);
  const endPt = polarToCartesian(cx, cy, r, end);
  const largeArcFlag = Math.abs(end - start) <= 180 ? '0' : '1';
  const sweepFlag = end < start ? '0' : '1'; // direction
  return `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endPt.x} ${endPt.y}`;
}

/* =========================================================
   Demo page: supply items & render
========================================================= */
const demoItems: CarouselItem[] = [
  {
    title: 'Seela Launch',
    description:
      'Seela, the pioneering online platform that trains teams in technical and functional cybersecurity.',
  },
  {
    title: 'Pr0ph3cy Launch',
    description:
      'Pr0ph3cy secures funding to deliver a comprehensive 360° cybersecurity solution for organizations.',
  },
  {
    title: 'OpenCyber Integration',
    description:
      'Opencyber, a leader in penetration testing, joins the group to deepen technical audit capabilities.',
  },
  {
    title: 'Harmony Technology',
    description:
      'Harmonie Technologie strengthens strategic cybersecurity consulting across the portfolio.',
  },
  {
    title: 'Seela Evolves',
    description:
      'Cyber Unity, Cyber Training, and BattleHack form a dynamic ecosystem for awareness and skills.',
  },
  {
    title: 'NEVERHACK Rebrand',
    description:
      'A unified strategy backed by significant investment accelerates European cybersecurity growth.',
  },
  {
    title: 'Expert Line',
    description:
      'SOC services scale prevention, detection, and 24/7 remediation of security incidents.',
  },
  {
    title: 'Cybers Joins',
    description:
      'Estonia-based Cybers expands SOC expertise and extends operations in Northern Europe.',
  },
  {
    title: 'Innovery Integration',
    description:
      'Innovery extends NEVERHACK’s presence across Southern Europe, Mexico, and the United States.',
  },
  {
    title: 'Seela Today',
    description:
      'Training teams globally with hands-on programs for both functional and technical cybersecurity.',
  },
];

export default function Page() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200">
      <header className="sticky top-0 z-10 border-b border-neutral-900 bg-neutral-950/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <span className="font-semibold tracking-wide text-neutral-300">SemiCircle Carousel • Framer Motion</span>
          <span className="text-xs text-neutral-500">Scroll to explore</span>
        </div>
      </header>

  <SemiCircleCarousel
    items={demoItems}
    textDirection="ccw"
    textRotateOffset={90}
  contentRadiusOffset={860}
  contentLeftScale={1.06}
  rightNudgePct={0.32}
    // Show first item centered, others below it at load; then scroll brings items up
    startAngle={-90}
    endAngle={90}
    orbitDirection="ccw"
    initialAngleOffset={90}
    arcStrokeWidth={48}
    centerContentAtStart
    sweepMultiplier={1.36}
  />
    </main>
  );
}
