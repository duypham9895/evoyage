'use client';

import { useRef, useCallback } from 'react';
import { VIETNAM_MAP } from './vietnam-map-paths';
import { LABEL_OFFSETS, getCityColor, ArchipelagoGroup } from './vietnam-map-helpers';

export default function VietnamMap() {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const touchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((name: string, x: number, y: number) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.textContent = name;
    tip.style.left = `${x}px`;
    tip.style.top = `${y - 40}px`;
    tip.style.opacity = '1';
  }, []);

  const hideTooltip = useCallback(() => {
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.style.opacity = '0';
  }, []);

  const findTarget = (e: React.SyntheticEvent) => {
    const el = e.target as SVGElement;
    const group = el.closest('.province, .named-island, .archipelago') as SVGElement | null;
    return group?.dataset.name ?? null;
  };

  const handleMouseOver = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const name = findTarget(e);
      if (name) {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        showTooltip(name, e.clientX - rect.left, e.clientY - rect.top);
      }
    },
    [showTooltip],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const tip = tooltipRef.current;
      if (!tip || tip.style.opacity === '0') return;
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      tip.style.left = `${e.clientX - rect.left}px`;
      tip.style.top = `${e.clientY - rect.top - 40}px`;
    },
    [],
  );

  const handleMouseOut = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      const name = findTarget(e);
      if (!name) return;
      const touch = e.touches[0];
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      showTooltip(name, touch.clientX - rect.left, touch.clientY - rect.top);

      if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = setTimeout(hideTooltip, 2000);
    },
    [showTooltip, hideTooltip],
  );

  return (
    <div className="relative w-full max-w-[500px] mx-auto">
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-10 bg-[#1C1C1E]/95 border border-[#00D4AA]/30 text-[#F5F5F7] px-3 py-1.5 rounded-lg text-[13px] font-medium backdrop-blur-sm shadow-lg transition-opacity duration-150"
        style={{ opacity: 0 }}
      />

      <svg
        viewBox={VIETNAM_MAP.viewBox}
        className="w-full h-auto"
        role="img"
        aria-label="Bản đồ Việt Nam với tuyến đường xe điện từ TP.HCM đến Hà Nội, bao gồm quần đảo Hoàng Sa và Trường Sa"
        onMouseOver={handleMouseOver}
        onMouseMove={handleMouseMove}
        onMouseOut={handleMouseOut}
        onTouchStart={handleTouchStart}
      >
        <defs>
          <linearGradient id="landFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="25%" stopColor="#1464F4" />
            <stop offset="85%" stopColor="#00D4AA" />
            <stop offset="100%" stopColor="#00D26A" />
          </linearGradient>
          <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1464F4" stopOpacity={0.08} />
            <stop offset="100%" stopColor="#0A0A0B" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="archipelagoHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00D4AA" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#00D4AA" stopOpacity={0} />
          </radialGradient>
          <filter id="routeGlow">
            <feGaussianBlur stdDeviation={3} />
          </filter>
        </defs>

        {/* 1. Background */}
        <rect x="-5" y="10" width="781" height="855" fill="url(#bgGlow)" />

        {/* 2. Provinces */}
        {VIETNAM_MAP.provinces.map((prov) => (
          <g key={prov.name} className="province" data-name={prov.name}>
            {prov.paths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        ))}

        {/* 3. Named islands */}
        {VIETNAM_MAP.islands.named.map((island) => {
          if (island.path !== null) {
            return (
              <g key={island.name} className="named-island" data-name={island.name}>
                <path d={island.path} fill="rgba(0,212,170,0.2)" stroke="#00D4AA" strokeWidth={0.8} />
                <text className="island-label-sm" x={island.center[0]} y={island.center[1] - 8} textAnchor="middle" fill="#8E8E93" fontSize={8}>
                  {island.name}
                </text>
              </g>
            );
          }
          return (
            <g key={island.name} className="named-island" data-name={island.name}>
              <circle cx={island.center[0]} cy={island.center[1]} r={8} fill="#00D4AA" opacity={0.1} />
              <circle cx={island.center[0]} cy={island.center[1]} r={3.5} fill="#00D4AA" />
              <text className="island-label-sm" x={island.center[0]} y={island.center[1] - 12} textAnchor="middle" fill="#8E8E93" fontSize={8}>
                {island.name}
              </text>
            </g>
          );
        })}

        {/* 4. Hoàng Sa */}
        <ArchipelagoGroup
          name="Quần đảo Hoàng Sa (Việt Nam)"
          label="Hoàng Sa"
          data={VIETNAM_MAP.islands.hoangSa}
          connector={VIETNAM_MAP.connectors.hoangSa}
          animationDelay="0s"
        />

        {/* 5. Trường Sa */}
        <ArchipelagoGroup
          name="Quần đảo Trường Sa (Việt Nam)"
          label="Trường Sa"
          data={VIETNAM_MAP.islands.truongSa}
          connector={VIETNAM_MAP.connectors.truongSa}
          animationDelay="1.5s"
        />

        {/* 6. Route */}
        <g pointerEvents="none">
          <path d={VIETNAM_MAP.route} fill="none" stroke="#00D26A" strokeWidth={2.5} opacity={0.3} filter="url(#routeGlow)" />
          <path d={VIETNAM_MAP.route} fill="none" stroke="#00D26A" strokeWidth={1} opacity={0.55} />
          <circle r={3} fill="#00D26A" opacity={0.9}>
            <animateMotion dur="5s" repeatCount="indefinite" path={VIETNAM_MAP.route} />
          </circle>
        </g>

        {/* 7. City nodes */}
        <g pointerEvents="none">
          {VIETNAM_MAP.cities.map((city, i) => {
            const color = getCityColor(city.name, i);
            const haloR = city.primary ? 7 : 5;
            const dotR = city.primary ? 3.5 : 2.5;
            const { dx, dy } = LABEL_OFFSETS[city.name] ?? { dx: 8, dy: 4 };
            return (
              <g key={city.name}>
                <circle cx={city.x} cy={city.y} r={haloR} fill={color} opacity={0.15} />
                <circle cx={city.x} cy={city.y} r={dotR} fill={color} />
                <text
                  x={city.x + dx}
                  y={city.y + dy}
                  fill={city.primary ? '#F5F5F7' : '#8E8E93'}
                  fontSize={city.primary ? 11 : 9}
                  fontWeight={city.primary ? 'bold' : 'normal'}
                  pointerEvents="none"
                >
                  {city.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
