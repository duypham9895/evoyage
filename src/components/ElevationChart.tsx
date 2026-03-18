'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ElevationProfile } from '@/lib/elevation';

interface ElevationChartProps {
  readonly profile: ElevationProfile;
  readonly chargingStopDistances?: readonly number[];
  readonly waypointDistances?: readonly number[];
  readonly onHoverDistance?: (distanceKm: number | null) => void;
}

// ── Layout Constants ──

const PADDING_LEFT = 8;
const PADDING_RIGHT = 8;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 20;
const DESKTOP_HEIGHT = 120;
const MOBILE_HEIGHT = 80;

// ── Helpers ──

function buildAreaPath(
  points: readonly { readonly x: number; readonly y: number }[],
  chartBottom: number,
): string {
  if (points.length === 0) return '';

  const lines = points.map((p, i) =>
    i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`,
  );

  // Close the area down to baseline and back
  return `${lines.join(' ')} L${points[points.length - 1].x},${chartBottom} L${points[0].x},${chartBottom} Z`;
}

function formatDistance(km: number): string {
  return km >= 10 ? `${Math.round(km)}` : `${km.toFixed(1)}`;
}

export default function ElevationChart({
  profile,
  chargingStopDistances = [],
  waypointDistances = [],
  onHoverDistance,
}: ElevationChartProps) {
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);

  const height = isMobile ? MOBILE_HEIGHT : DESKTOP_HEIGHT;
  const chartWidth = 100; // percentage-based, we use viewBox

  const viewBoxWidth = 600;
  const viewBoxHeight = height;

  const chartLeft = PADDING_LEFT;
  const chartRight = viewBoxWidth - PADDING_RIGHT;
  const chartTop = PADDING_TOP;
  const chartBottom = viewBoxHeight - PADDING_BOTTOM;
  const plotWidth = chartRight - chartLeft;
  const plotHeight = chartBottom - chartTop;

  const { points } = profile;

  // ── Compute scaled coordinates ──

  const scaledPoints = useMemo(() => {
    if (points.length === 0) return [];

    const maxDist = points[points.length - 1].distanceKm;
    const elevRange = profile.maxElevationM - profile.minElevationM;
    const effectiveRange = elevRange > 0 ? elevRange : 1;

    return points.map((p) => ({
      x: chartLeft + (maxDist > 0 ? (p.distanceKm / maxDist) * plotWidth : 0),
      y: chartTop + plotHeight - ((p.elevationM - profile.minElevationM) / effectiveRange) * plotHeight,
      distanceKm: p.distanceKm,
      elevationM: p.elevationM,
    }));
  }, [points, profile.maxElevationM, profile.minElevationM, chartLeft, plotWidth, chartTop, plotHeight]);

  // ── Max elevation point ──

  const maxElevPoint = useMemo(() => {
    if (scaledPoints.length === 0) return null;
    return scaledPoints.reduce((max, p) =>
      p.elevationM > max.elevationM ? p : max,
    );
  }, [scaledPoints]);

  // ── Steep section overlay paths ──

  const steepPaths = useMemo(() => {
    return profile.steepSections.map((section) => {
      const sectionPoints = scaledPoints.slice(section.startIdx, section.endIdx + 1);
      return buildAreaPath(sectionPoints, chartBottom);
    });
  }, [profile.steepSections, scaledPoints, chartBottom]);

  // ── X-axis labels (0%, 25%, 50%, 75%, 100%) ──

  const xLabels = useMemo(() => {
    if (points.length === 0) return [];
    const maxDist = points[points.length - 1].distanceKm;
    return [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
      x: chartLeft + frac * plotWidth,
      label: formatDistance(frac * maxDist),
    }));
  }, [points, chartLeft, plotWidth]);

  // ── Distance-to-X mapping for markers ──

  const distToX = useCallback(
    (distKm: number): number => {
      if (points.length === 0) return chartLeft;
      const maxDist = points[points.length - 1].distanceKm;
      if (maxDist === 0) return chartLeft;
      return chartLeft + (distKm / maxDist) * plotWidth;
    },
    [points, chartLeft, plotWidth],
  );

  // ── Interpolate Y for a given distance ──

  const distToY = useCallback(
    (distKm: number): number => {
      if (scaledPoints.length === 0) return chartBottom;
      // Find surrounding points and interpolate
      for (let i = 1; i < scaledPoints.length; i++) {
        if (scaledPoints[i].distanceKm >= distKm) {
          const prev = scaledPoints[i - 1];
          const curr = scaledPoints[i];
          const segDist = curr.distanceKm - prev.distanceKm;
          if (segDist === 0) return curr.y;
          const frac = (distKm - prev.distanceKm) / segDist;
          return prev.y + frac * (curr.y - prev.y);
        }
      }
      return scaledPoints[scaledPoints.length - 1].y;
    },
    [scaledPoints, chartBottom],
  );

  // ── Mouse hover (desktop only) ──

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (isMobile || !onHoverDistance || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const xRatio = (e.clientX - rect.left) / rect.width;
      const svgX = xRatio * viewBoxWidth;

      if (svgX < chartLeft || svgX > chartRight) {
        onHoverDistance(null);
        return;
      }

      const maxDist = points.length > 0 ? points[points.length - 1].distanceKm : 0;
      const distKm = ((svgX - chartLeft) / plotWidth) * maxDist;
      onHoverDistance(Math.max(0, Math.min(distKm, maxDist)));
    },
    [isMobile, onHoverDistance, points, chartLeft, chartRight, plotWidth, viewBoxWidth],
  );

  const handleMouseLeave = useCallback(() => {
    onHoverDistance?.(null);
  }, [onHoverDistance]);

  // ── Accessibility text ──

  const ariaLabel = useMemo(() => {
    const steepText =
      profile.steepSections.length > 0
        ? ` Steep sections at ${profile.steepSections
            .map((s) => `km ${Math.round(points[s.startIdx]?.distanceKm ?? 0)}-${Math.round(points[s.endIdx]?.distanceKm ?? 0)}`)
            .join(', ')}.`
        : '';
    return `Route elevation: ${profile.totalAscentM}m ascent, ${profile.totalDescentM}m descent.${steepText}`;
  }, [profile, points]);

  if (points.length < 2) return null;

  const areaPath = buildAreaPath(scaledPoints, chartBottom);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{
        height: `${height}px`,
        backgroundColor: 'var(--color-surface)',
        borderRadius: '8px',
      }}
      role="img"
      aria-label={ariaLabel}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        {/* Gradient fill for the area */}
        <linearGradient id="elev-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
        </linearGradient>

        {/* Hatched pattern for steep sections (accessible without color) */}
        <pattern
          id="steep-hatch"
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="var(--color-danger)"
            strokeWidth="2"
            strokeOpacity="0.7"
          />
        </pattern>
      </defs>

      {/* Main area fill */}
      <path d={areaPath} fill="url(#elev-fill)" />

      {/* Area outline */}
      <path
        d={scaledPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
      />

      {/* Steep section overlays with hatched pattern */}
      {steepPaths.map((path, i) => (
        <path key={`steep-${i}`} d={path} fill="url(#steep-hatch)" />
      ))}

      {/* X-axis labels */}
      {xLabels.map((label, i) => (
        <text
          key={`x-${i}`}
          x={label.x}
          y={viewBoxHeight - 4}
          textAnchor="middle"
          fontSize="10"
          fill="#94a3b8"
          fontFamily="system-ui, sans-serif"
        >
          {label.label}
        </text>
      ))}

      {/* Max elevation label */}
      {maxElevPoint && (
        <>
          <circle
            cx={maxElevPoint.x}
            cy={maxElevPoint.y}
            r="3"
            fill="var(--color-accent)"
          />
          <text
            x={maxElevPoint.x}
            y={maxElevPoint.y - 6}
            textAnchor="middle"
            fontSize="9"
            fill="#e2e8f0"
            fontFamily="system-ui, sans-serif"
          >
            {maxElevPoint.elevationM}m
          </text>
        </>
      )}

      {/* Charging stop markers (⚡) */}
      {chargingStopDistances.map((dist, i) => {
        const cx = distToX(dist);
        const cy = distToY(dist);
        return (
          <text
            key={`charge-${i}`}
            x={cx}
            y={cy - 8}
            textAnchor="middle"
            fontSize="12"
          >
            ⚡
          </text>
        );
      })}

      {/* Waypoint markers (numbered circles) */}
      {waypointDistances.map((dist, i) => {
        const cx = distToX(dist);
        const cy = distToY(dist);
        return (
          <g key={`wp-${i}`}>
            <circle
              cx={cx}
              cy={cy}
              r="7"
              fill="var(--color-accent)"
              stroke="var(--color-surface)"
              strokeWidth="1.5"
            />
            <text
              x={cx}
              y={cy + 3.5}
              textAnchor="middle"
              fontSize="8"
              fill="var(--color-surface)"
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
