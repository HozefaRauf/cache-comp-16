'use client';

import * as React from 'react';
import { motion, useScroll, useTransform, MotionValue, useReducedMotion, useMotionValue, animate, useSpring } from 'framer-motion';
import Image from 'next/image';
import cardImg from './image-card.jpg';

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
  /**
   * Fraction of the arc span used to place items/labels/dots (0 < itemsSpanPct <= 1).
   * Smaller values compress items closer together along the arc without changing the visible arc itself.
   */
  itemsSpanPct?: number; // default 1
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
  /** Ignore the OS/browser reduced-motion preference and always animate */
  ignoreReducedMotion?: boolean; // default false
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
  thresholdDeg,
  clearDeg,
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
  thresholdDeg: number;
  clearDeg: number;
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

  // Attraction based on proximity to center (0°), normalized by half the item spacing (thresholdDeg)
  const attraction = useTransform(angleDeg, (ang) => {
    const dist = Math.abs(((normalizeAngle(ang) + 180) % 360) - 180);
    const th = Math.max(0.001, thresholdDeg);
    return 1 - Math.min(dist / th, 1);
  });
  // Smooth color mix from neutral to emerald as we approach the fixed green dot
  const dotColor = useTransform(attraction, [0, 1], ['#a3a3a3', '#22c55e']);
  
  // Directional fade/blur relative to center (0°):
  // items approaching from below (negative signed angle) fade in;
  // items moving above center (positive) fade out faster (half distance).
  const signedDist = useTransform(angleDeg, (a) => {
    const norm = (((normalizeAngle(a) + 180) % 360) - 180);
    return norm; // deg, negative = below, positive = above
  });
  const fadeT = useTransform(signedDist, (d) => {
    const absd = Math.abs(d);
    const clear = Math.max(0.001, clearDeg);
    const over = Math.max(0, absd - clear);
    const denom = d > 0 ? clear : clear * 2; // faster fade out above, slower below
    return Math.min(over / Math.max(0.001, denom), 1);
  });
  const opacity = useTransform(fadeT, (t) => 0.08 + Math.pow(1 - t, 0.9) * 0.92);
  const scale = useTransform(fadeT, (t) => lerp(0.96, 1.06, 1 - t));
  const blur = useTransform([fadeT, signedDist], (vals) => {
    const t = vals[0] as number;
    const d = vals[1] as number;
    const maxBlur = d > 0 ? 6 : 4; // slightly blurrier when above center
    const px = maxBlur * Math.pow(t, 0.8);
    return `blur(${px.toFixed(2)}px)`;
  });

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
        filter: isReduced ? 'none' : blur,
      }}
      aria-current={false}
    >
      {/* Marker only (no left-panel text). Adjust size/color as desired. */}
      <motion.span
        className="block rounded-full shadow-[0_0_10px_rgba(255,255,255,0.06)]"
        style={{
          backgroundColor: dotColor,
          width: index === 0 ? 14 : 10,
          height: index === 0 ? 14 : 10,
        }}
        title={`Item ${index + 1}`}
      />
    </motion.li>
  );
}

/* =========================================================
   Phase label (text) placed near inner arc, follows same motion
========================================================= */
function ArcPhaseLabel({
  label,
  radius,
  cx,
  cy,
  baseAngle,
  angleOffset,
  isReduced,
  textDirection,
  textRotateOffset,
  thresholdDeg,
  clearDeg,
}: {
  label: string;
  radius: number;
  cx: number;
  cy: number;
  baseAngle: number;
  angleOffset: MotionValue<number>;
  isReduced: boolean;
  textDirection: 'cw' | 'ccw' | 'upright';
  textRotateOffset: number;
  thresholdDeg: number;
  clearDeg: number;
}) {
  const angleDeg = useTransform(angleOffset, (off) => baseAngle + off);
  const x = useTransform(angleDeg, (a) => cx + radius * Math.cos(deg2rad(a)));
  const y = useTransform(angleDeg, (a) => cy + radius * Math.sin(deg2rad(a)));

  const rotCW = useTransform(angleDeg, (a) => a + 90 + textRotateOffset);
  const rotCCW = useTransform(angleDeg, (a) => a - 90 + textRotateOffset);
  const rot: MotionValue<number> | number =
    textDirection === 'upright' ? textRotateOffset : textDirection === 'cw' ? rotCW : rotCCW;

  // Directional fade/blur relative to center (0°)
  const signedDist = useTransform(angleDeg, (a) => {
    const norm = (((normalizeAngle(a) + 180) % 360) - 180);
    return norm;
  });
  const fadeT = useTransform(signedDist, (d) => {
    const absd = Math.abs(d);
    const clear = Math.max(0.001, clearDeg);
    const over = Math.max(0, absd - clear);
    const denom = d > 0 ? clear : clear * 2;
    return Math.min(over / Math.max(0.001, denom), 1);
  });
  const opacity = useTransform(fadeT, (t) => 0.08 + Math.pow(1 - t, 0.9) * 0.92);
  const scale = useTransform(fadeT, (t) => 0.96 + (1 - t) * 0.04);
  const blur = useTransform([fadeT, signedDist], (vals) => {
    const t = vals[0] as number;
    const d = vals[1] as number;
    const maxBlur = d > 0 ? 6 : 4;
    const px = maxBlur * Math.pow(t, 0.8);
    return `blur(${px.toFixed(2)}px)`;
  });

  // Smooth color change to green when near center, analogous to dots
  const attraction = useTransform(angleDeg, (a) => {
    const dist = Math.abs(((normalizeAngle(a) + 180) % 360) - 180);
    const th = Math.max(0.001, thresholdDeg);
    return 1 - Math.min(dist / th, 1);
  });
  const textColor = useTransform(attraction, [0, 1], ['#374151', '#22c55e']); // neutral-700 to emerald-500

  return (
    <motion.li
      className="absolute will-change-transform"
      style={{
        left: x,
        top: y,
        translateX: '-100%', // anchor text to extend inward (left) from the arc
        translateY: '-50%',
        rotate: rot,
        opacity: isReduced ? 1 : opacity,
        scale: isReduced ? 1 : scale,
        filter: isReduced ? 'none' : blur,
      }}
    >
      <motion.span
        className="text-[24px] md:text-[28px] font-semibold tracking-widest uppercase whitespace-nowrap"
        style={{ color: textColor }}
      >
        {label}
      </motion.span>
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
  itemsSpanPct = 1,
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
  ignoreReducedMotion = false,
}: SemiCircleProps) {
  const prefersReduced = useReducedMotion();
  const isReduced = ignoreReducedMotion ? false : prefersReduced;

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
  // Smooth the scroll-derived angle with a gentle spring for buttery motion
  const angleSmoothed = useSpring(angleOffset, { stiffness: 120, damping: 28, mass: 0.8 });
  const angleDriver = isReduced ? zeroMV : angleSmoothed;
  // Snap assist: when user stops scrolling and a card's dot is within half-spacing, nudge it to center
  const snapMV = useMotionValue(0);
  const angleWithSnap = useTransform([angleDriver, snapMV], (vals) => (vals[0] as number) + (vals[1] as number));
  const angleDriverWithSnap = isReduced ? angleDriver : angleWithSnap;

  // local canvas coordinates: we draw a full circle centered at (r,r)
  // then position the canvas left by -r so the vertical diameter hugs the viewport's left edge.
  const canvasSize = R * 2;
  const cx = R;
  const cy = R;

  const totalPinHeight = Math.max(items.length, 2) * pinVHPerItem * Math.max(1, sweepMultiplier); // in vh

  // Precompute base angles for N items evenly spaced along the 180° arc
  const n = Math.max(items.length, 2);
  // Compress the item spacing along the arc without changing the drawn arc itself
  const mid = (startAngle + endAngle) / 2;
  const span = Math.abs(endAngle - startAngle);
  const effHalfSpan = (span * Math.max(0.05, Math.min(1, itemsSpanPct))) / 2; // clamp to avoid degeneracy
  const startEff = mid - effHalfSpan;
  const endEff = mid + effHalfSpan;
  const baseAngles = items.map((_, i) => lerp(startEff, endEff, n === 1 ? 0 : i / (n - 1)));
  const deltaDeg = n > 1 ? Math.abs(endEff - startEff) / (n - 1) : span;
  const thresholdDeg = deltaDeg * 0.35; // smaller threshold for a softer, less aggressive magnet
  const clearDeg = deltaDeg / 2; // fully clear when within half the original inter-item distance
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

  // Idle detection + snap behavior toward nearest center if within threshold
  React.useEffect(() => {
    if (isReduced) return;
    let timeoutId: number | null = null;
    const prevVelRef = { current: 0 } as { current: number };
    const onChange = () => {
      // cancel scheduled snap and gently release any active snap offset
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (snapMV.get() !== 0) {
        animate(snapMV, 0, { type: 'spring', stiffness: 260, damping: 34 });
      }
      const runCheck = () => {
        const raw = angleDriver.get();
        const vel = Math.abs(angleDriver.getVelocity());
        const velThreshold = 20; // deg/sec; above this we consider user still scrolling
        // If dots are very close to center, allow magnet even while slowly scrolling down (only on downward scroll)
        const syVel = scrollYProgress.getVelocity ? scrollYProgress.getVelocity() : 0;
        const nearWhileScrolling = vel <= 60 && syVel > 0; // permit weak magnet at low velocities when scrolling down
        // compute nearest item to center (0°)
        let bestIdx = 0;
        let bestAbs = Infinity;
        for (let i = 0; i < baseAngles.length; i++) {
          const a = baseAngles[i] + raw;
          const norm = (((a % 360) + 540) % 360) - 180;
          const abs = Math.abs(norm);
          if (abs < bestAbs) {
            bestAbs = abs;
            bestIdx = i;
          }
        }
        const delta = n > 1 ? Math.abs(endEff - startEff) / (n - 1) : span;
        const threshold = delta * 0.35; // softer magnet range
        if ((vel <= velThreshold && bestAbs < threshold) || (nearWhileScrolling && bestAbs < threshold * 0.5)) {
          const a = baseAngles[bestIdx] + raw;
          const norm = (((a % 360) + 540) % 360) - 180;
          const target = -norm;
          // if we're essentially centered, lock in precisely and stop
          if (Math.abs(norm) < 0.5) {
            snapMV.set(target);
          } else {
            // Stronger magnet when extremely close, but still smooth
            const strong = bestAbs < threshold * 0.25;
            animate(snapMV, target, {
              type: 'spring',
              stiffness: strong ? 110 : 80,
              damping: 36,
            });
          }
        } else {
          animate(snapMV, 0, { type: 'spring', stiffness: 260, damping: 34 });
        }
      };
      // Instant check when stopping: if velocity just dropped below threshold, run immediately
      const currentVel = Math.abs(angleDriver.getVelocity());
      const prevVel = prevVelRef.current;
      prevVelRef.current = currentVel;
      if (prevVel > 20 && currentVel <= 20) {
        runCheck();
      } else {
        // fallback idle check
        timeoutId = window.setTimeout(runCheck, 150);
      }
    };

    const unsub = angleDriver.on('change', onChange);
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      unsub();
    };
  }, [angleDriver, baseAngles, endEff, isReduced, n, snapMV, startEff, span, scrollYProgress]);

  return (
    <section
      className={['w-full bg-white text-neutral-800', className ?? ''].join(' ')}
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
                  {/* Visible right semi accent with light green gradient and low opacity */}
                  <defs>
                    <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#86efac" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.25" />
                    </linearGradient>
                  </defs>
                  <path
                    d={describeArc(cx, cy, R - arcStrokeWidth / 2, startAngle, endAngle)}
                    fill="none"
                    stroke="url(#arcGrad)"
                    strokeWidth={arcStrokeWidth}
                    strokeLinecap="round"
                  />
                  {/* Midpoint radial line inside the stroke (bright green) */}
                  {(() => {
                    // Short, fixed marker centered in the stroke at 0° (rightmost point)
                    const midR = R - arcStrokeWidth / 2;
                    // Make the line length equal to the arc's border thickness
                    const halfLen = arcStrokeWidth / 2; // total length = arcStrokeWidth
                    const inner = midR - halfLen;
                    const outer = midR + halfLen;
                    const x1 = cx + inner;
                    const y1 = cy;
                    const x2 = cx + outer;
                    const y2 = cy;
                    const tickWidth = 2; // render as a thin 2px line
                    return (
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#22c55e"
                        strokeWidth={tickWidth}
                        strokeLinecap="butt" // sharp ends to avoid circular appearance
                      />
                    );
                  })()}
                  {/* Removed rightmost tick to avoid any visual overlap on the arc */}
                </svg>

                {/* Fixed green magnet dot at the center alignment point */}
                {(() => {
                  const labelRadius = R + Math.round(R * 0.08);
                  const gx = cx + labelRadius;
                  const gy = cy;
                  const size = 16; // slightly larger than moving dots
                  return (
                    <div
                      className="absolute"
                      style={{ left: gx, top: gy, transform: 'translate(-50%, -50%)', zIndex: 25 }}
                      aria-hidden
                    >
                      <span
                        className="block rounded-full"
                        style={{ width: size, height: size, backgroundColor: '#22c55e' }}
                      />
                    </div>
                  );
                })()}

                {/* Labels UL (markers only) */}
                <ul className="absolute inset-0 z-20 pointer-events-none" aria-hidden="true">
                  {items.map((it, i) => {
                    const base = baseAngles[i];
                    // Position dots outside the arc's outer edge with ~8% gap of R (4x previous 2%)
                    const labelRadius = R + Math.round(R * 0.08);
                    return (
                      <ArcLabel
                        key={i}
                        index={i}
                        n={n}
                        radius={labelRadius}
                        cx={cx}
                        cy={cy}
                        baseAngle={base}
                        angleOffset={angleDriverWithSnap}
                        isReduced={!!isReduced}
                        textDirection={textDirection}
                        textRotateOffset={textRotateOffset}
                        textClassName={textClassName}
                        thresholdDeg={thresholdDeg}
                        clearDeg={clearDeg}
                      />
                    );
                  })}
                </ul>

                {/* Phase Labels UL: text following inner arc, aligned with cards */}
                <ul className="absolute inset-0 z-20 pointer-events-none" aria-hidden="true">
                  {items.map((_, i) => {
                    const base = baseAngles[i];
                    const phaseLabel = `PHASE ${i + 1}`;
                    // Place just inside the arc stroke
                    const phaseRadius = R - arcStrokeWidth - 20; // inner side of stroke with padding
                    return (
                      <ArcPhaseLabel
                        key={`phase-${i}`}
                        label={phaseLabel}
                        radius={phaseRadius}
                        cx={cx}
                        cy={cy}
                        baseAngle={base}
                        angleOffset={angleDriverWithSnap}
                        isReduced={!!isReduced}
                        textDirection={textDirection}
                        textRotateOffset={textRotateOffset}
                        thresholdDeg={thresholdDeg}
                        clearDeg={clearDeg}
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
                          key={`content-${i}`}
                          contentRadius={contentRadius}
                          contentLeftScale={contentLeftScale}
                          cx={cx}
                          cy={cy}
                          baseAngle={base}
                          angleOffset={angleDriverWithSnap}
                          isReduced={!!isReduced}
                          textDirection={textDirection}
                          textRotateOffset={textRotateOffset}
                          title={it.title}
                          description={it.description}
                          clearDeg={clearDeg}
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
        <p className="text-neutral-500">Normal scroll resumes…</p>
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
  clearDeg,
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
  clearDeg: number;
}) {
  const angleDeg = useTransform(angleOffset, (off) => baseAngle + off);
  const xBase = useTransform(angleDeg, (a) => cx + contentRadius * Math.cos(deg2rad(a)));
  const x = useTransform(xBase, (v) => v * contentLeftScale);
  const y = useTransform(angleDeg, (a) => cy + contentRadius * Math.sin(deg2rad(a)));
  const rotCW = useTransform(angleDeg, (a) => a + 90 + textRotateOffset);
  const rotCCW = useTransform(angleDeg, (a) => a - 90 + textRotateOffset);
  const rot: MotionValue<number> | number =
    textDirection === 'upright' ? textRotateOffset : textDirection === 'cw' ? rotCW : rotCCW;

  // Directional fade/blur relative to center with faster fade when moving up
  const signedDist = useTransform(angleDeg, (a) => {
    const norm = (((normalizeAngle(a) + 180) % 360) - 180);
    return norm;
  });
  const fadeT = useTransform(signedDist, (d) => {
    const absd = Math.abs(d);
    const clear = Math.max(0.001, clearDeg);
    const over = Math.max(0, absd - clear);
    const denom = d > 0 ? clear : clear * 2;
    return Math.min(over / Math.max(0.001, denom), 1);
  });
  const opacity = useTransform(fadeT, (t) => 0.08 + Math.pow(1 - t, 0.9) * 0.92);
  const scale = useTransform(fadeT, (t) => lerp(0.95, 1, 1 - t));
  const blur = useTransform([fadeT, signedDist], (vals) => {
    const t = vals[0] as number;
    const d = vals[1] as number;
    const maxBlur = d > 0 ? 8 : 5; // cards can tolerate a bit more blur
    const px = maxBlur * Math.pow(t, 0.85);
    return `blur(${px.toFixed(2)}px)`;
  });

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
        filter: isReduced ? 'none' : blur,
      }}
    >
      <div className="pointer-events-none select-none w-[600px]">
        {/* Card with header+image in a single row */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          {/* Row: Left header, Right image */}
          <div className="mb-6 flex items-stretch gap-6">
            {/* Header (left column) */}
            <div className="flex-1 min-w-0">
              <h3 className="text-black text-3xl font-bold mb-4">
                The <span className="font-black">Aspiring</span> Coach
              </h3>
              <p className="text-black text-base leading-relaxed">
                You will first learn how to to confidently navigate a coaching session. You will learn ethical practices and how to establish a powerful coach-client relationship.
              </p>
            </div>
            {/* Image (right column) */}
            <div className="relative rounded-2xl overflow-hidden bg-white shadow-lg w-56 md:w-64 h-48">
              <Image
                src={cardImg}
                alt="Coaching session"
                fill
                sizes="(min-width: 768px) 16rem, 14rem"
                className="object-cover"
                priority={false}
              />
            </div>
          </div>

          {/* Concepts */}
          <div>
            <h4 className="text-black text-xl font-bold mb-4">Concepts Covered</h4>
            <div className="flex flex-wrap gap-2">
              <span className="px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">The Coaching Arc</span>
              <span className="px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">The Blank Canvas</span>
              <span className="px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">The Heroic Lens</span>
              <span className="px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">Agenda Setting</span>
              <span className="px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">Ethics</span>
              <span className="px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">Rapport & Trust</span>
            </div>
          </div>

          {/* Decorative dot */}
          <div className="absolute bottom-8 right-8 w-16 h-16 bg-emerald-400 rounded-full opacity-20"></div>
        </div>
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
  { title: 'The Aspiring Coach', description: 'Learn coaching fundamentals' },
  { title: 'The Aspiring Coach', description: 'Learn coaching fundamentals' },
  { title: 'The Aspiring Coach', description: 'Learn coaching fundamentals' },
  { title: 'The Aspiring Coach', description: 'Learn coaching fundamentals' },
];

export default function Page() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <span className="font-semibold tracking-wide text-neutral-700">SemiCircle Carousel • Framer Motion</span>
          <span className="text-xs text-neutral-500">Scroll to explore</span>
        </div>
      </header>

  <SemiCircleCarousel
    items={demoItems}
    textDirection="ccw"
    textRotateOffset={90}
  contentRadiusOffset={860}
  contentLeftScale={1.06}
  rightNudgePct={0.30}
    itemsSpanPct={0.6}
    ignoreReducedMotion
    // Show first item centered, others below it at load; then scroll brings items up
    startAngle={-90}
    endAngle={90}
    orbitDirection="ccw"
    initialAngleOffset={90}
    arcStrokeWidth={96}
    arcStroke="#E5E7EB"
    centerContentAtStart
    sweepMultiplier={1.7}
  />
    </main>
  );
}
