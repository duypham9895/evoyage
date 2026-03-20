/** Shared constants and sub-components for VietnamMap */

export const CITY_COLORS: Record<string, string> = {
  'Hà Nội': '#1464F4',
  'TP.HCM': '#00D26A',
  'Đà Lạt': '#00D4AA',
};

export const LABEL_OFFSETS: Record<string, { dx: number; dy: number }> = {
  'Hà Nội': { dx: 8, dy: 4 },
  'TP.HCM': { dx: -45, dy: 14 },
  'Vinh': { dx: -30, dy: 4 },
  'Huế': { dx: -28, dy: 4 },
  'Đà Nẵng': { dx: 8, dy: 4 },
  'Quy Nhơn': { dx: 8, dy: 4 },
  'Nha Trang': { dx: 8, dy: 4 },
  'Đà Lạt': { dx: 8, dy: 4 },
};

export function getCityColor(name: string, index: number): string {
  return CITY_COLORS[name] ?? (index % 2 === 0 ? '#1464F4' : '#00D26A');
}

export function ArchipelagoGroup({
  name,
  label,
  data,
  connector,
  animationDelay,
}: {
  name: string;
  label: string;
  data: { center: readonly [number, number]; dots: readonly (readonly [number, number])[] };
  connector: { from: readonly [number, number]; to: readonly [number, number] };
  animationDelay: string;
}) {
  const [cx, cy] = data.center;

  return (
    <g className="archipelago" data-name={name}>
      <circle cx={cx} cy={cy} r={40} fill="url(#archipelagoHalo)" opacity={0.15} />
      <circle
        className="ring-expand"
        cx={cx}
        cy={cy}
        r={15}
        fill="none"
        stroke="#00D4AA"
        strokeWidth={0.8}
        style={{ animationDelay }}
      />
      <g className="breathe" style={{ animationDelay }}>
        {data.dots.map(([dx, dy], i) => (
          <circle key={i} cx={dx} cy={dy} r={3.5} fill="#00D4AA" />
        ))}
      </g>
      <rect
        x={cx - 32}
        y={cy + 16}
        width={64}
        height={28}
        rx={6}
        fill="#1C1C1E"
        fillOpacity={0.75}
      />
      <text x={cx} y={cy + 29} textAnchor="middle" fill="#F5F5F7" fontSize={11} fontWeight="bold">
        {label}
      </text>
      <text x={cx} y={cy + 39} textAnchor="middle" fill="#8E8E93" fontSize={8}>
        (Việt Nam)
      </text>
      <line
        x1={connector.from[0]}
        y1={connector.from[1]}
        x2={connector.to[0]}
        y2={connector.to[1]}
        stroke="#00D4AA"
        strokeWidth={0.6}
        strokeDasharray="4 3"
        opacity={0.3}
      />
    </g>
  );
}
