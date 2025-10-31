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

// Smooth easing for scroll-to-angle mapping
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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
  centerRefDeg,
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
  centerRefDeg: number;
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
    const d = ang - centerRefDeg;
    const dist = Math.abs((((normalizeAngle(d) + 180) % 360) - 180));
    const th = Math.max(0.001, thresholdDeg);
    return 1 - Math.min(dist / th, 1);
  });
  // Smooth color mix from neutral to emerald as we approach the fixed green dot
  const dotColor = useTransform(attraction, [0, 1], ['#a3a3a3', '#22c55e']);
  
  // Directional fade/blur relative to center (0°):
  // items approaching from below (negative signed angle) fade in;
  // items moving above center (positive) fade out faster (half distance).
  const signedDist = useTransform(angleDeg, (a) => {
    const d = a - centerRefDeg;
    const norm = (((normalizeAngle(d) + 180) % 360) - 180);
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
  centerRefDeg,
  isMobile,
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
  centerRefDeg: number;
  isMobile: boolean;
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
    const d = a - centerRefDeg;
    const norm = (((normalizeAngle(d) + 180) % 360) - 180);
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
    const d = a - centerRefDeg;
    const dist = Math.abs((((normalizeAngle(d) + 180) % 360) - 180));
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
        translateX: isMobile ? '-50%' : '-100%', // mobile centers; desktop extends inward
        translateY: isMobile ? '-100%' : '-50%',
        rotate: rot,
        opacity: isReduced ? 1 : opacity,
        scale: isReduced ? 1 : scale,
        filter: isReduced ? 'none' : blur,
      }}
    >
      <motion.span
        className="text-[12px] sm:text-[16px] md:text-[22px] lg:text-[28px] font-semibold tracking-widest uppercase whitespace-nowrap"
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

  // Keep a component-scoped ref to control a brief dwell/pause at center
  const dwellRef = React.useRef<{ active: boolean; idx: number | null; timer: number | null }>({
    active: false,
    idx: null,
    timer: null,
  });

  const pinRef = React.useRef<HTMLDivElement | null>(null);
  const stickyRef = React.useRef<HTMLDivElement | null>(null);

  // Dynamically size the visible semicircle to 36% of the viewport width
  const [vw, setVw] = React.useState<number | null>(null);
  const [vh, setVh] = React.useState<number | null>(null);
  React.useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth || 0);
      setVh(window.innerHeight || 0);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = (vw ?? 0) < 768;
  const R = vw ? (isMobile ? Math.round((vw) / 2) : Math.round(vw * 0.36)) : radius; // mobile: span full width; else 36vw
  // Responsive arc stroke: slimmer on small screens for a cleaner mobile look
  const arcStrokeW = isMobile ? Math.min(64, Math.max(36, Math.round(R * 0.14))) : arcStrokeWidth;

  // Scroll progress that starts only once the pinned wrapper reaches the top of the viewport
  // This ensures we "start changing" items only when fully scrolled to the component.
  const { scrollYProgress } = useScroll({
    target: pinRef,
    offset: ['start start', 'end start'],
  });

  // Select arc orientation per viewport
  // Mobile: draw bottom semicircle (0°→180°) positioned at top so arc faces down
  const sA = isMobile ? 0 : startAngle;
  const eA = isMobile ? 180 : endAngle;
  const centerRefDeg = isMobile ? 90 : 0; // mobile center at bottom of arc (90°); desktop at right (0°)
  // Mobile-only rotation offset for text: force 0 on mobile
  const effectiveTextRotateOffset = isMobile ? 0 : textRotateOffset;

  // One sweep across the visible semicircle scaled by sweepMultiplier
  const sweep = Math.abs(eA - sA); // base 180
  const totalSweep = sweep * Math.max(1, sweepMultiplier);

  // Precompute base angles for N items (used for pacing breakpoint)
  const n = Math.max(items.length, 2);
  const mid = (sA + eA) / 2;
  const span = Math.abs(eA - sA);
  // On mobile, spread items further apart by expanding their span along the arc
  const itemsSpanPctForCalc = isMobile
    ? Math.min(1, Math.max(itemsSpanPct, 0.95)) // ensure at least 95% of arc on mobile (up to full)
    : itemsSpanPct;
  const effHalfSpan = (span * Math.max(0.05, Math.min(1, itemsSpanPctForCalc))) / 2; // clamp to avoid degeneracy
  const startEff = mid - effHalfSpan;
  const endEff = mid + effHalfSpan;
  const baseAngles = items.map((_, i) => lerp(startEff, endEff, n === 1 ? 0 : i / (n - 1)));

  // Compute an initial offset: on mobile, start with the FIRST item centered at the reference angle
  const effectiveInitialOffset = isMobile ? (centerRefDeg - baseAngles[0]) : initialAngleOffset;

  // Pace mapping: slow from item 1 -> item 4 reaching center, then resume normal speed
  const lastIdx = n - 1;
  const vSwitchRaw = (orbitDirection === 'ccw')
    ? (effectiveInitialOffset + baseAngles[lastIdx]) / Math.max(1e-6, totalSweep)
    : (-effectiveInitialOffset - baseAngles[lastIdx]) / Math.max(1e-6, totalSweep);
  const vSwitch = Math.max(0, Math.min(1, vSwitchRaw));
  // Mobile: Use the entire pinned scroll to reach exactly when the last item hits center (no dead zone).
  const requiredSweep = totalSweep * vSwitch; // degrees needed to bring last item to center (mobile pacing)
  // Mobile: use entire pin to exactly reach the last item center (no tail/dead zone)
  const paceProgressMobile = useTransform(scrollYProgress, (u) => {
    const e = easeInOutCubic(Math.max(0, Math.min(1, u)));
    return vSwitch * e; // 0..vSwitch
  });
  // Map 0..vSwitch -> 0..requiredSweep (mobile)
  const angleOffsetBaseMobile = useTransform(paceProgressMobile, (p) => {
    const r = Math.max(0, Math.min(vSwitch, p));
    return (r / Math.max(1e-6, vSwitch)) * requiredSweep;
  });
  // Desktop: keep previous full-sweep pacing across the entire pin height
  // Desktop: add a small inert tail at the end of the pin for a gentle fade-out
  const tailPctDesktop = 0.2; // 6% of pin height
  const paceProgressDesktop = useTransform(scrollYProgress, (u) => {
    const uu = Math.max(0, Math.min(1, u));
    const cutoff = Math.max(0.01, 1 - tailPctDesktop);
    if (uu < cutoff) {
      const t = uu / cutoff; // remap 0..cutoff -> 0..1
      return easeInOutCubic(t);
    }
    return 1; // hold completed during tail range
  });
  const angleOffsetBaseDesktop = useTransform(paceProgressDesktop, (p) => p * totalSweep);
  const angleOffsetBase = isMobile ? angleOffsetBaseMobile : angleOffsetBaseDesktop;
  const signed = useTransform(angleOffsetBase, (v) => (orbitDirection === 'ccw' ? -v : v));
  const angleOffset = useTransform(signed, (v) => v + effectiveInitialOffset);
  // Provide a non-animating driver for reduced motion so children can always rely on a MotionValue
  const zeroMV = useMotionValue(effectiveInitialOffset);
  // Smooth the scroll-derived angle. Use extra-smooth spring before the 4th card passes center,
  // then blend to the normal spring for a snappier feel afterwards.
  const angleSmoothedFast = useSpring(angleOffset, { stiffness: 90, damping: 30, mass: 1.05 });
  const angleSmoothedSlow = useSpring(angleOffset, { stiffness: 55, damping: 32, mass: 1.08 });
  // Spring blending: mobile keeps gentler spring; desktop blends to faster spring after a breakpoint
  const smoothMixMobile = useTransform(scrollYProgress, () => 0);
  const smoothMixDesktop = useTransform(scrollYProgress, (u) => {
    // Use vSwitch as a rough breakpoint; blend to fast spring towards the end of the pin
    const ub = Math.max(0.05, Math.min(0.95, vSwitch));
    const t = (Math.max(0, Math.min(1, u)) - ub) / Math.max(1e-6, 1 - ub);
    return Math.max(0, Math.min(1, t));
  });
  const smoothMix = isMobile ? smoothMixMobile : smoothMixDesktop;
  const angleSmoothedBlend = useTransform([angleSmoothedFast, angleSmoothedSlow, smoothMix], (vals) => {
    const fast = vals[0] as number;
    const slow = vals[1] as number;
    const m = vals[2] as number;
    return slow * (1 - m) + fast * m;
  });
  // Desktop: ensure no under-travel at the very end; smoothly switch to raw target angle in the last ~1.5% of pin
  const angleDriverEndSafe = useTransform([angleSmoothedBlend, angleOffset, scrollYProgress], (vals) => {
    const blended = vals[0] as number;
    const raw = vals[1] as number;
    const u = Math.max(0, Math.min(1, vals[2] as number));
    if (isMobile) return blended; // mobile keeps gentler spring all the way (with end-tail handled above)
    const start = 0.985; // begin crossfade at 98.5%
    const end = 0.9995; // fully raw by 99.95%
    const t = Math.max(0, Math.min(1, (u - start) / Math.max(1e-6, end - start)));
    // ease the mix for a seamless transition
    const mix = t * t * (3 - 2 * t);
    return raw * mix + blended * (1 - mix);
  });
  const angleDriver = isReduced ? zeroMV : angleDriverEndSafe;
  // Snap assist: when user stops scrolling and a card's dot is within half-spacing, nudge it to center
  const snapMV = useMotionValue(0);

  // local canvas coordinates: we draw a full circle centered at (r,r)
  // then position the canvas left by -r so the vertical diameter hugs the viewport's left edge.
  const canvasSize = R * 2;
  const cx = R;
  const cy = R;

  // Mobile: halve the physical scroll length by reducing per-item pin height
  const effectivePinVHPerItem = isMobile ? pinVHPerItem * 2.5 : pinVHPerItem;
  const totalPinHeight = Math.max(items.length, 1) * effectivePinVHPerItem * Math.max(1, sweepMultiplier); // in vh

  // Values derived from base angles
  const deltaDeg = n > 1 ? Math.abs(endEff - startEff) / (n - 1) : span;
  const thresholdDeg = deltaDeg * 0.35; // smaller threshold for a softer, less aggressive magnet
  const clearDeg = deltaDeg / 2; // fully clear when within half the original inter-item distance
  const contentRadius = isMobile
    ? (() => {
        // Slightly more separation on mobile (bumped again)
        if (!vh) return R + Math.max(240, Math.round(R * 1.05));
        const safeGap = Math.round(arcStrokeW * 0.9) + 84; // +12px more than last tweak
        const minRadius = R + safeGap;
        const targetY = Math.round(vh * 0.75); // a bit lower for extra breathing room
        const desiredRadius = targetY - R; // cy=R and y = cy + radius at 90°
        const boost = Math.round(R * 0.28); // +4% R over previous boost
        return Math.max(minRadius, desiredRadius) + boost;
      })()
    : R + contentRadiusOffset;

  // Dynamic slowdown near the nearest center: compress relative angle locally
  const slowRadius = clearDeg; // start slowing within the clear zone
  const minScale = 0.5; // slightly stronger slowdown at exact center (lower = slower)
  const angleSlowed = isReduced
    ? angleDriver
    : useTransform(angleDriver, (a) => {
        // find nearest center (baseAngle) to current scroll angle
        let nearest = baseAngles[0];
        let bestAbs = Infinity;
        for (let i = 0; i < baseAngles.length; i++) {
          const r = baseAngles[i] + a;
          const d = r - centerRefDeg;
          const norm = (((d % 360) + 540) % 360) - 180; // signed distance to centerRef
          const abs = Math.abs(norm);
          if (abs < bestAbs) {
            bestAbs = abs;
            nearest = baseAngles[i];
          }
        }
        // signed distance to center for nearest item
        const r = nearest + a;
        const d = r - centerRefDeg;
        const norm = (((d % 360) + 540) % 360) - 180;
        const t = Math.min(Math.abs(norm) / Math.max(0.001, slowRadius), 1);
        // ease so slowdown concentrates very near center
        const easeOut = 1 - Math.pow(1 - t, 2.2);
        const k = minScale + (1 - minScale) * easeOut; // k in [minScale,1]
        const rPrime = norm * k;
        // Preserve the absolute angle by applying only the delta (rPrime - norm)
        // a' = a + (rPrime - norm)
        const aPrime = a + (rPrime - norm);
        return aPrime;
      });

  // Combine slowed angle with snap offset for the final driver used by UI
  const angleWithSnap = useTransform([angleSlowed, snapMV], (vals) => (vals[0] as number) + (vals[1] as number));
  const angleDriverWithSnap = isReduced ? angleSlowed : angleWithSnap;
  // Optional horizontal centering for the first card at start
  const contentXOffset = useMotionValue(0);
  React.useEffect(() => {
    const update = () => {
      if (!centerContentAtStart || isMobile) {
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
  const raw = angleSlowed.get();
  const vel = Math.abs(angleSlowed.getVelocity());
  const velThreshold = 20; // deg/sec; above this we consider user still scrolling
  // If dots are very close to center, allow magnet even while slowly scrolling down (only on downward scroll)
  const syVel = scrollYProgress.getVelocity ? scrollYProgress.getVelocity() : 0;
  const nearWhileScrolling = vel <= 50 && syVel > 0; // permit weak magnet at very low velocities when scrolling down
        // compute nearest item to center (0°)
        let bestIdx = 0;
        let bestAbs = Infinity;
        for (let i = 0; i < baseAngles.length; i++) {
          const a = baseAngles[i] + raw;
          const d = a - centerRefDeg;
          const norm = (((d % 360) + 540) % 360) - 180;
          const abs = Math.abs(norm);
          if (abs < bestAbs) {
            bestAbs = abs;
            bestIdx = i;
          }
        }
        const delta = n > 1 ? Math.abs(endEff - startEff) / (n - 1) : span;
  const threshold = delta * 0.35; // magnet capture range
  const dwellEnter = threshold * 0.5; // enter dwell when extremely close to center
  const dwellMs = 420; // a touch longer pause for readability
  const dwellVelMax = 180; // allow dwell to start even with moderate scroll input
  const velCancel = 220; // only much faster motion cancels dwell

        // If dwelling and user speeds up or moves away, cancel dwell
        if (dwellRef.current.active) {
          const isFast = vel > velCancel || Math.abs(syVel) > 0.6;
          const movedAway = bestIdx !== dwellRef.current.idx && bestAbs > dwellEnter;
          if (isFast || movedAway) {
            if (dwellRef.current.timer) window.clearTimeout(dwellRef.current.timer);
            dwellRef.current = { active: false, idx: null, timer: null };
            animate(snapMV, 0, { type: 'spring', stiffness: 260, damping: 34 });
          } else {
            // keep dwell lock; do not adjust during dwell
            return;
          }
        }

        // If we're extremely close to center and not moving excessively fast, trigger dwell regardless of direction
        if (!dwellRef.current.active && bestAbs < dwellEnter && vel <= dwellVelMax) {
          const a = baseAngles[bestIdx] + raw;
          const d = a - centerRefDeg;
          const norm = (((d % 360) + 540) % 360) - 180;
          const target = -norm;
          dwellRef.current.active = true;
          dwellRef.current.idx = bestIdx;
          // Gently settle into center for a smooth "attach" feel
          animate(snapMV, target, { type: 'spring', stiffness: 110, damping: 30 });
          dwellRef.current.timer = window.setTimeout(() => {
            dwellRef.current = { active: false, idx: null, timer: null };
            // Smoothly release after dwell
            animate(snapMV, 0, { type: 'spring', stiffness: 85, damping: 38 });
          }, dwellMs);
          return;
        }

        if ((vel <= velThreshold && bestAbs < threshold) || (nearWhileScrolling && bestAbs < threshold * 0.4)) {
          const a = baseAngles[bestIdx] + raw;
          const d = a - centerRefDeg;
          const norm = (((d % 360) + 540) % 360) - 180;
          const target = -norm;
          // if we're essentially centered, lock in precisely and stop
          if (Math.abs(norm) < 0.8) {
            snapMV.set(target);
            // Initiate a brief dwell to create an ease-in/ease-out pause at center
            if (!dwellRef.current.active && bestAbs < dwellEnter && vel <= dwellVelMax) {
              dwellRef.current.active = true;
              dwellRef.current.idx = bestIdx;
              // Ensure we stay centered during dwell
              snapMV.set(target);
              dwellRef.current.timer = window.setTimeout(() => {
                // release with a gentle spring for smooth ease out
                dwellRef.current = { active: false, idx: null, timer: null };
                animate(snapMV, 0, { type: 'spring', stiffness: 85, damping: 38 });
              }, dwellMs);
            }
          } else {
            // Proximity-weighted magnet: stronger and snappier as dots get closer
            const proximity = Math.min(1, Math.max(0, 1 - bestAbs / Math.max(0.001, threshold)));
            const stiff = 120 + Math.pow(proximity, 1.3) * 240; // 120..360
            const damp = 40 + Math.pow(proximity, 0.9) * 10;     // 40..50
            // If extremely close, hard-lock to avoid micro jitter
            if (bestAbs < threshold * 0.15) {
              snapMV.set(target);
            } else {
              animate(snapMV, Math.abs(target) < 0.2 ? 0 : target, {
                type: 'spring',
                stiffness: stiff,
                damping: damp,
              });
            }
          }
        } else {
          animate(snapMV, 0, { type: 'spring', stiffness: 260, damping: 34 });
        }
      };
      // Instant check when stopping: if velocity just dropped below threshold, run immediately
  const currentVel = Math.abs(angleSlowed.getVelocity());
      const prevVel = prevVelRef.current;
      prevVelRef.current = currentVel;
      if (prevVel > 20 && currentVel <= 20) {
        runCheck();
      } else {
        // fallback idle check
        timeoutId = window.setTimeout(runCheck, 120);
      }
    };

  const unsub = angleSlowed.on('change', onChange);
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (dwellRef.current.timer) window.clearTimeout(dwellRef.current.timer);
      unsub();
    };
  }, [angleSlowed, baseAngles, endEff, isReduced, n, snapMV, startEff, span, scrollYProgress]);

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
                className={isMobile ? 'absolute' : 'absolute top-1/2 -translate-y-1/2'}
                style={
                  isMobile
                    ? { width: canvasSize, height: canvasSize, left: '50%', top: -R, transform: 'translate(-50%, 0)' }
                    : { width: canvasSize, height: canvasSize, left: -R }
                }
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
                    d={describeArc(cx, cy, R - arcStrokeW / 2, sA, eA)}
                    fill="none"
                    stroke="url(#arcGrad)"
                    strokeWidth={arcStrokeW}
                    strokeLinecap="round"
                  />
                  {/* Midpoint radial line inside the stroke (bright green) */}
                  {(() => {
                    // Short, fixed marker centered in the stroke at 0° (rightmost point)
                    const midR = R - arcStrokeW / 2;
                    // Make the line length equal to the arc's border thickness
                    const halfLen = arcStrokeW / 2; // total length = arcStrokeW
                    const inner = midR - halfLen;
                    const outer = midR + halfLen;
                    // Draw tick at the center reference angle
                    const ax = (r: number, deg: number) => ({ x: cx + r * Math.cos(deg2rad(deg)), y: cy + r * Math.sin(deg2rad(deg)) });
                    const p1 = ax(inner, centerRefDeg);
                    const p2 = ax(outer, centerRefDeg);
                    const x1 = p1.x;
                    const y1 = p1.y;
                    const x2 = p2.x;
                    const y2 = p2.y;
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
                  // Place the magnet dot outside the arc border on mobile and desktop
                  const labelRadius = R + Math.round(R * 0.08);
                  const gx = cx + labelRadius * Math.cos(deg2rad(centerRefDeg));
                  const gy = cy + labelRadius * Math.sin(deg2rad(centerRefDeg));
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
                    // Dots outside the arc with ~8% gap of R on all viewports
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
                        textRotateOffset={effectiveTextRotateOffset}
                        textClassName={textClassName}
                        thresholdDeg={thresholdDeg}
                        clearDeg={clearDeg}
                        centerRefDeg={centerRefDeg}
                      />
                    );
                  })}
                </ul>

                {/* Phase Labels UL: text following inner arc, aligned with cards */}
                <ul className="absolute inset-0 z-20 pointer-events-none" aria-hidden="true">
                  {items.map((_, i) => {
                    const base = baseAngles[i];
                    const phaseLabel = `PHASE ${i + 1}`;
                    // Place near the inner edge of the arc stroke for crisp alignment (slightly inside on mobile)
                    const phaseRadius = isMobile ? (R - Math.round(arcStrokeW * 0.5) - 18) : (R - arcStrokeW - 20);
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
                        textRotateOffset={effectiveTextRotateOffset}
                        thresholdDeg={thresholdDeg}
                        clearDeg={clearDeg}
                        centerRefDeg={centerRefDeg}
                        isMobile={isMobile}
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
                          contentLeftScale={isMobile ? 1 : contentLeftScale}
                          cx={cx}
                          cy={cy}
                          baseAngle={base}
                          angleOffset={angleDriverWithSnap}
                          isReduced={!!isReduced}
                          textDirection={isMobile ? 'upright' : textDirection}
                          textRotateOffset={effectiveTextRotateOffset}
                          title={it.title}
                          description={it.description}
                          clearDeg={clearDeg}
                          centerRefDeg={centerRefDeg}
                          extraAngleOffsetDeg={0}
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
  centerRefDeg,
  extraAngleOffsetDeg = 0,
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
  centerRefDeg: number;
  extraAngleOffsetDeg?: number;
}) {
  const dotAngleDeg = useTransform(angleOffset, (off) => baseAngle + off);
  const angleDeg = useTransform(angleOffset, (off) => baseAngle + off + extraAngleOffsetDeg);
  const xBase = useTransform(angleDeg, (a) => cx + contentRadius * Math.cos(deg2rad(a)));
  const x = useTransform(xBase, (v) => v * contentLeftScale);
  const y = useTransform(angleDeg, (a) => cy + contentRadius * Math.sin(deg2rad(a)));
  const rotCW = useTransform(angleDeg, (a) => a + 90 + textRotateOffset);
  const rotCCW = useTransform(angleDeg, (a) => a - 90 + textRotateOffset);
  const rot: MotionValue<number> | number =
    textDirection === 'upright' ? textRotateOffset : textDirection === 'cw' ? rotCW : rotCCW;

  // Directional fade/blur relative to center with faster fade when moving up
  const signedDist = useTransform(dotAngleDeg, (a) => {
    const d = a - centerRefDeg;
    const norm = (((normalizeAngle(d) + 180) % 360) - 180);
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
      <div className="pointer-events-none select-none w-[92vw] sm:w-[600px]">
        {/* Card with header+image in a single row */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl relative overflow-hidden">
          {/* Row: Left header, Right image */}
          <div className="mb-4 sm:mb-6 flex flex-col md:flex-row items-stretch gap-4 md:gap-6">
            {/* Header (left column) */}
            <div className="flex-1 min-w-0">
              <h3 className="text-black text-xl sm:text-2xl md:text-3xl font-bold mb-3 sm:mb-4">
                The <span className="font-black">Aspiring</span> Coach
              </h3>
              <p className="text-black text-sm sm:text-base leading-relaxed">
                You will first learn how to to confidently navigate a coaching session. You will learn ethical practices and how to establish a powerful coach-client relationship.
              </p>
            </div>
            {/* Image (right column) */}
            <div className="relative rounded-2xl overflow-hidden bg-white shadow-lg w-full md:w-64 h-40 sm:h-48">
              <Image
                src={cardImg}
                alt="Coaching session"
                fill
                sizes="(min-width: 768px) 16rem, 92vw"
                className="object-cover"
                priority={false}
              />
            </div>
          </div>

          {/* Concepts */}
          <div>
            <h4 className="text-black text-base sm:text-lg md:text-xl font-bold mb-3 sm:mb-4">Concepts Covered</h4>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 sm:px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-xs sm:text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">The Coaching Arc</span>
              <span className="px-3 sm:px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-xs sm:text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">The Blank Canvas</span>
              <span className="px-3 sm:px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-xs sm:text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">The Heroic Lens</span>
              <span className="px-3 sm:px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-xs sm:text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">Agenda Setting</span>
              <span className="px-3 sm:px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-xs sm:text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">Ethics</span>
              <span className="px-3 sm:px-4 py-2 rounded-full backdrop-blur-md bg-white/20 text-black text-xs sm:text-sm font-medium border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">Rapport & Trust</span>
            </div>
          </div>

          {/* Decorative dot */}
          <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 md:bottom-8 md:right-8 w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-emerald-400 rounded-full opacity-20"></div>
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
    <main className="min-h-screen bg-white text-neutral-800">
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
    itemsSpanPct={1}
    pinVHPerItem={100}
    ignoreReducedMotion
    // Show first item centered, others below it at load; then scroll brings items up
    startAngle={-90}
    endAngle={90}
    orbitDirection="ccw"
    initialAngleOffset={90}
    arcStrokeWidth={96}
    arcStroke="#E5E7EB"
    centerContentAtStart
    sweepMultiplier={1}
  />
    </main>
  );
}
