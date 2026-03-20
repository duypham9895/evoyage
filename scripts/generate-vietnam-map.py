#!/usr/bin/env python3
"""
Generate pre-computed SVG path data for Vietnam map from GADM TopoJSON.

Downloads TopoJSON data, processes provinces/islands, applies geographic
projection, simplifies polygons, and outputs a TypeScript module.

Usage: python3 scripts/generate-vietnam-map.py
"""

import json
import math
import os
import sys
import urllib.request
from typing import Any

# === Constants ===

TOPOJSON_URL = (
    "https://gist.githubusercontent.com/tandat2209/5eb797fc2bcc1c8b6d71271353a40ab4"
    "/raw/ca883f00b7843afeb7b6ad73ec4370ab514a8a90"
    "/vietnam-with-paracel-and-spartly-islands.json"
)
CACHE_PATH = "/tmp/vietnam-complete.json"

# Projection parameters
LON_MIN = 101.5
LON_MAX = 118.0
LAT_MIN = 7.0
LAT_MAX = 24.5
CENTER_LAT = 15.75
COS_LAT = math.cos(math.radians(CENTER_LAT))  # ~0.9625
SVG_W = 771
SVG_H = 850
REAL_W = (LON_MAX - LON_MIN) * COS_LAT
REAL_H = LAT_MAX - LAT_MIN

# Simplification tolerances (geographic degrees)
PROVINCE_TOLERANCE = 0.008
ISLAND_TOLERANCE = 0.003

# Output path (relative to project root)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_PATH = os.path.join(
    PROJECT_ROOT, "src", "components", "landing", "vietnam-map-paths.ts"
)

# Legal name fixes
NAME_FIXES: dict[str, str] = {
    "Bà Rịa - Vũng Tàu": "Bà Rịa \u2013 Vũng Tàu",  # en-dash
    "Thừa Thiên Huế": "Thừa Thiên \u2013 Huế",  # en-dash
    "Hoà Bình": "Hòa Bình",  # diacritic fix
}

# Named islands to extract from province polygons
NAMED_ISLANDS = [
    {
        "name": "Phú Quốc",
        "province": "Kiên Giang",
        "lat": 10.22,
        "lon": 103.96,
        "radius": 0.4,
        "min_area": 0.01,
    },
    {
        "name": "Cát Bà",
        "province": "Hải Phòng",
        "lat": 20.73,
        "lon": 106.98,
        "radius": 0.3,
        "min_area": 0.0001,
    },
    {
        "name": "Lý Sơn",
        "province": "Quảng Ngãi",
        "lat": 15.38,
        "lon": 109.13,
        "radius": 0.2,
        "min_area": 0.0001,
    },
    {
        "name": "Thổ Chu",
        "province": "Kiên Giang",
        "lat": 9.26,
        "lon": 103.46,
        "radius": 0.2,
        "min_area": 0.0001,
    },
    {
        "name": "Bạch Long Vĩ",
        "province": "Hải Phòng",
        "lat": 20.13,
        "lon": 107.73,
        "radius": 0.2,
        "min_area": 0.0001,
    },
    {
        "name": "Cồn Cỏ",
        "province": "Quảng Trị",
        "lat": 17.16,
        "lon": 107.34,
        "radius": 0.2,
        "min_area": 0.0001,
    },
]

# Côn Đảo: dot only (no polygon in GADM data)
CON_DAO = {"name": "Côn Đảo", "lat": 8.68, "lon": 106.60}

# Cities for map labels
CITIES = [
    {"name": "Hà Nội", "lat": 21.0285, "lon": 105.8542, "primary": True},
    {"name": "Vinh", "lat": 18.6796, "lon": 105.6813, "primary": False},
    {"name": "Huế", "lat": 16.4637, "lon": 107.5909, "primary": False},
    {"name": "Đà Nẵng", "lat": 16.0544, "lon": 108.2022, "primary": False},
    {"name": "Quy Nhơn", "lat": 13.7563, "lon": 109.2297, "primary": False},
    {"name": "Nha Trang", "lat": 12.2388, "lon": 109.1967, "primary": False},
    {"name": "Đà Lạt", "lat": 11.9404, "lon": 108.4583, "primary": False},
    {"name": "TP.HCM", "lat": 10.8231, "lon": 106.6297, "primary": True},
]

# Connector lines (from city area to island group label)
CONNECTORS = {
    "hoangSa": {
        "from_lat": 16.05,
        "from_lon": 108.20,
        "to_key": "hoangSa",
    },
    "truongSa": {
        "from_lat": 12.24,
        "from_lon": 109.20,
        "to_key": "truongSa",
    },
}


# === Projection ===


def project(lon: float, lat: float) -> tuple[float, float]:
    """Project geographic coordinates to SVG coordinates."""
    x = (lon - LON_MIN) * COS_LAT / REAL_W * SVG_W
    y = (1 - (lat - LAT_MIN) / REAL_H) * SVG_H
    return (round(x, 1), round(y, 1))


# === TopoJSON decoding ===


def decode_arcs(topology: dict[str, Any]) -> list[list[tuple[float, float]]]:
    """Decode delta-encoded TopoJSON arcs into absolute geographic coordinates."""
    transform = topology.get("transform", {})
    scale = transform.get("scale", [1, 1])
    translate = transform.get("translate", [0, 0])

    decoded_arcs: list[list[tuple[float, float]]] = []
    for arc in topology["arcs"]:
        coords: list[tuple[float, float]] = []
        x, y = 0, 0
        for dx, dy in arc:
            x += dx
            y += dy
            real_x = x * scale[0] + translate[0]
            real_y = y * scale[1] + translate[1]
            coords.append((real_x, real_y))
        decoded_arcs.append(coords)
    return decoded_arcs


def resolve_ring(
    arc_indices: list[int], decoded_arcs: list[list[tuple[float, float]]]
) -> list[tuple[float, float]]:
    """Resolve a ring of arc indices into a list of coordinates."""
    coords: list[tuple[float, float]] = []
    for idx in arc_indices:
        if idx >= 0:
            arc = decoded_arcs[idx]
        else:
            arc = list(reversed(decoded_arcs[~idx]))
        # Skip first point of subsequent arcs to avoid duplicates
        start = 0 if len(coords) == 0 else 1
        coords.extend(arc[start:])
    return coords


def extract_polygons(
    geometry: dict[str, Any], decoded_arcs: list[list[tuple[float, float]]]
) -> list[list[list[tuple[float, float]]]]:
    """Extract polygon rings from a TopoJSON geometry object.

    Returns a list of polygons, each being a list of rings (outer + holes).
    """
    geo_type = geometry.get("type", "")
    arcs = geometry.get("arcs", [])

    polygons: list[list[list[tuple[float, float]]]] = []

    if geo_type == "Polygon":
        rings = [resolve_ring(ring_arcs, decoded_arcs) for ring_arcs in arcs]
        polygons.append(rings)
    elif geo_type == "MultiPolygon":
        for poly_arcs in arcs:
            rings = [resolve_ring(ring_arcs, decoded_arcs) for ring_arcs in poly_arcs]
            polygons.append(rings)

    return polygons


# === Ramer-Douglas-Peucker simplification ===


def perpendicular_distance(
    point: tuple[float, float],
    line_start: tuple[float, float],
    line_end: tuple[float, float],
) -> float:
    """Calculate perpendicular distance from a point to a line segment."""
    dx = line_end[0] - line_start[0]
    dy = line_end[1] - line_start[1]
    if dx == 0 and dy == 0:
        return math.sqrt(
            (point[0] - line_start[0]) ** 2 + (point[1] - line_start[1]) ** 2
        )
    t = ((point[0] - line_start[0]) * dx + (point[1] - line_start[1]) * dy) / (
        dx * dx + dy * dy
    )
    t = max(0, min(1, t))
    proj_x = line_start[0] + t * dx
    proj_y = line_start[1] + t * dy
    return math.sqrt((point[0] - proj_x) ** 2 + (point[1] - proj_y) ** 2)


def simplify_ring(
    coords: list[tuple[float, float]], tolerance: float
) -> list[tuple[float, float]]:
    """Simplify a ring using Ramer-Douglas-Peucker algorithm on geographic coords."""
    if len(coords) <= 3:
        return coords

    max_dist = 0.0
    max_idx = 0
    for i in range(1, len(coords) - 1):
        d = perpendicular_distance(coords[i], coords[0], coords[-1])
        if d > max_dist:
            max_dist = d
            max_idx = i

    if max_dist > tolerance:
        left = simplify_ring(coords[: max_idx + 1], tolerance)
        right = simplify_ring(coords[max_idx:], tolerance)
        return left[:-1] + right
    else:
        return [coords[0], coords[-1]]


# === Polygon area (shoelace formula in geographic coords) ===


def polygon_area(coords: list[tuple[float, float]]) -> float:
    """Calculate the absolute area of a polygon using the shoelace formula."""
    n = len(coords)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += coords[i][0] * coords[j][1]
        area -= coords[j][0] * coords[i][1]
    return abs(area) / 2.0


def polygon_centroid(
    coords: list[tuple[float, float]],
) -> tuple[float, float]:
    """Calculate centroid of a polygon."""
    n = len(coords)
    if n == 0:
        return (0.0, 0.0)
    cx = sum(p[0] for p in coords) / n
    cy = sum(p[1] for p in coords) / n
    return (cx, cy)


# === SVG path generation ===


def ring_to_svg_path(ring: list[tuple[float, float]]) -> str:
    """Convert a ring of geographic coordinates to an SVG path string."""
    if len(ring) < 2:
        return ""
    projected = [project(lon, lat) for lon, lat in ring]
    parts = [f"M{projected[0][0]},{projected[0][1]}"]
    for x, y in projected[1:]:
        parts.append(f"L{x},{y}")
    parts.append("Z")
    return "".join(parts)


def polygons_to_svg_paths(
    polygons: list[list[list[tuple[float, float]]]], tolerance: float
) -> list[str]:
    """Convert a list of polygons to SVG path strings with simplification."""
    paths: list[str] = []
    for rings in polygons:
        path_parts: list[str] = []
        for ring in rings:
            simplified = simplify_ring(ring, tolerance)
            if len(simplified) >= 3:
                svg = ring_to_svg_path(simplified)
                if svg:
                    path_parts.append(svg)
        if path_parts:
            paths.append("".join(path_parts))
    return paths


# === Main processing ===


def download_topojson() -> dict[str, Any]:
    """Download or load cached TopoJSON data."""
    if os.path.exists(CACHE_PATH):
        print(f"Using cached TopoJSON from {CACHE_PATH}")
    else:
        print(f"Downloading TopoJSON to {CACHE_PATH}...")
        urllib.request.urlretrieve(TOPOJSON_URL, CACHE_PATH)
        print("Download complete.")

    with open(CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)


def fix_province_name(name: str) -> str:
    """Apply legal name fixes to province names."""
    return NAME_FIXES.get(name, name)


def extract_provinces(
    topology: dict[str, Any], decoded_arcs: list[list[tuple[float, float]]]
) -> list[dict[str, Any]]:
    """Extract and process all 63 provinces."""
    provinces_layer = topology["objects"].get("gadm36_VNM_1", {})
    geometries = provinces_layer.get("geometries", [])

    provinces: list[dict[str, Any]] = []
    for geom in geometries:
        props = geom.get("properties", {})
        raw_name = props.get("NAME_1", "Unknown")
        name = fix_province_name(raw_name)

        polygons = extract_polygons(geom, decoded_arcs)
        paths = polygons_to_svg_paths(polygons, PROVINCE_TOLERANCE)

        if paths:
            provinces.append({"name": name, "paths": paths, "polygons": polygons})

    provinces.sort(key=lambda p: p["name"])
    return provinces


def extract_island_dots(
    topology: dict[str, Any],
    decoded_arcs: list[list[tuple[float, float]]],
    layer_name: str,
) -> list[tuple[float, float]]:
    """Extract island center dots from a TopoJSON layer."""
    layer = topology["objects"].get(layer_name, {})
    geometries = layer.get("geometries", [])

    dots: list[tuple[float, float]] = []
    for geom in geometries:
        polygons = extract_polygons(geom, decoded_arcs)
        for rings in polygons:
            if rings:
                centroid = polygon_centroid(rings[0])
                dots.append(project(centroid[0], centroid[1]))
    return dots


def find_island_polygon(
    provinces: list[dict[str, Any]], island: dict[str, Any]
) -> tuple[str | None, tuple[float, float]]:
    """Find an island polygon within a province's geometry."""
    target_province = island["province"]
    target_lat = island["lat"]
    target_lon = island["lon"]
    radius = island["radius"]
    min_area = island["min_area"]

    province_data = None
    for p in provinces:
        if p["name"] == target_province or fix_province_name(p["name"]) == target_province:
            province_data = p
            break

    if province_data is None:
        print(f"  Warning: Province '{target_province}' not found for {island['name']}")
        center = project(target_lon, target_lat)
        return (None, center)

    best_polygon: list[tuple[float, float]] | None = None
    best_area = 0.0

    for rings in province_data["polygons"]:
        if not rings:
            continue
        outer_ring = rings[0]
        centroid = polygon_centroid(outer_ring)
        dist = math.sqrt(
            (centroid[0] - target_lon) ** 2 + (centroid[1] - target_lat) ** 2
        )
        area = polygon_area(outer_ring)

        if dist <= radius and area >= min_area:
            if area > best_area:
                best_area = area
                best_polygon = outer_ring

    if best_polygon is not None:
        simplified = simplify_ring(best_polygon, ISLAND_TOLERANCE)
        path = ring_to_svg_path(simplified)
        centroid = polygon_centroid(best_polygon)
        center = project(centroid[0], centroid[1])
        return (path, center)
    else:
        print(f"  Warning: No polygon found for {island['name']}")
        center = project(target_lon, target_lat)
        return (None, center)


def compute_island_group_center(
    dots: list[tuple[float, float]],
) -> tuple[float, float]:
    """Compute the center of a group of island dots."""
    if not dots:
        return (0.0, 0.0)
    cx = sum(d[0] for d in dots) / len(dots)
    cy = sum(d[1] for d in dots) / len(dots)
    return (round(cx, 1), round(cy, 1))


def generate_typescript(
    provinces: list[dict[str, Any]],
    hoang_sa_dots: list[tuple[float, float]],
    truong_sa_dots: list[tuple[float, float]],
    named_islands: list[dict[str, Any]],
    cities: list[dict[str, Any]],
) -> str:
    """Generate the TypeScript output file content."""
    lines: list[str] = []
    lines.append("// Auto-generated by scripts/generate-vietnam-map.py")
    lines.append("// Source: GADM TopoJSON (CC0 license)")
    lines.append(
        "// Do not edit manually — regenerate with: python3 scripts/generate-vietnam-map.py"
    )
    lines.append("")
    lines.append("export const VIETNAM_MAP = {")
    lines.append("  viewBox: '-5 10 781 855',")

    # Provinces
    lines.append("  provinces: [")
    for prov in provinces:
        paths_json = json.dumps(prov["paths"], ensure_ascii=False)
        escaped_name = prov["name"].replace("'", "\\'")
        lines.append(f"    {{ name: '{escaped_name}', paths: {paths_json} }},")
    lines.append("  ],")

    # Islands
    hoang_sa_center = compute_island_group_center(hoang_sa_dots)
    truong_sa_center = compute_island_group_center(truong_sa_dots)

    lines.append("  islands: {")

    # Hoàng Sa
    lines.append("    hoangSa: {")
    lines.append(
        f"      center: [{hoang_sa_center[0]}, {hoang_sa_center[1]}] as const,"
    )
    dots_str = ", ".join(f"[{d[0]}, {d[1]}]" for d in hoang_sa_dots)
    lines.append(f"      dots: [{dots_str}] as const,")
    lines.append("    },")

    # Trường Sa
    lines.append("    truongSa: {")
    lines.append(
        f"      center: [{truong_sa_center[0]}, {truong_sa_center[1]}] as const,"
    )
    dots_str = ", ".join(f"[{d[0]}, {d[1]}]" for d in truong_sa_dots)
    lines.append(f"      dots: [{dots_str}] as const,")
    lines.append("    },")

    # Named islands
    lines.append("    named: [")
    for ni in named_islands:
        name = ni["name"].replace("'", "\\'")
        path = f"'{ni['path']}'" if ni["path"] else "null"
        center = ni["center"]
        lines.append(
            f"      {{ name: '{name}', path: {path}, "
            f"center: [{center[0]}, {center[1]}] as const }},"
        )
    lines.append("    ],")

    lines.append("  },")

    # Cities
    lines.append("  cities: [")
    for city in cities:
        name = city["name"].replace("'", "\\'")
        primary = "true" if city["primary"] else "false"
        lines.append(
            f"    {{ name: '{name}', x: {city['x']}, y: {city['y']}, "
            f"primary: {primary} }},"
        )
    lines.append("  ],")

    # Route (Bézier curve through cities, south to north)
    city_coords = [
        (c["x"], c["y"]) for c in sorted(cities, key=lambda c: -c["y"])
    ]
    route_parts = [f"M{city_coords[0][0]},{city_coords[0][1]}"]
    for i in range(1, len(city_coords)):
        prev = city_coords[i - 1]
        curr = city_coords[i]
        # Control points for smooth curve
        cp1x = round(prev[0] + (curr[0] - prev[0]) * 0.5, 1)
        cp1y = round(prev[1] + (curr[1] - prev[1]) * 0.3, 1)
        cp2x = round(curr[0] - (curr[0] - prev[0]) * 0.2, 1)
        cp2y = round(curr[1] - (curr[1] - prev[1]) * 0.1, 1)
        route_parts.append(
            f" C{cp1x},{cp1y} {cp2x},{cp2y} {curr[0]},{curr[1]}"
        )
    route = "".join(route_parts)
    lines.append(f"  route: '{route}',")

    # Connectors
    hoang_sa_conn_from = project(CONNECTORS["hoangSa"]["from_lon"], CONNECTORS["hoangSa"]["from_lat"])
    truong_sa_conn_from = project(CONNECTORS["truongSa"]["from_lon"], CONNECTORS["truongSa"]["from_lat"])

    # "to" is near the island group center but offset slightly inward
    hoang_sa_conn_to = (
        round(hoang_sa_center[0] - 40, 1),
        round(hoang_sa_center[1], 1),
    )
    truong_sa_conn_to = (
        round(truong_sa_center[0] - 50, 1),
        round(truong_sa_center[1], 1),
    )

    lines.append("  connectors: {")
    lines.append(
        f"    hoangSa: {{ from: [{hoang_sa_conn_from[0]}, {hoang_sa_conn_from[1]}] as const, "
        f"to: [{hoang_sa_conn_to[0]}, {hoang_sa_conn_to[1]}] as const }},"
    )
    lines.append(
        f"    truongSa: {{ from: [{truong_sa_conn_from[0]}, {truong_sa_conn_from[1]}] as const, "
        f"to: [{truong_sa_conn_to[0]}, {truong_sa_conn_to[1]}] as const }},"
    )
    lines.append("  },")

    lines.append("} as const;")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    """Main entry point."""
    print("=== Vietnam Map Generator ===")
    print()

    # Step 1: Download/load TopoJSON
    topology = download_topojson()
    print(f"Objects in TopoJSON: {list(topology.get('objects', {}).keys())}")
    print()

    # Step 2: Decode arcs
    print("Decoding arcs...")
    decoded_arcs = decode_arcs(topology)
    print(f"Decoded {len(decoded_arcs)} arcs")
    print()

    # Step 3: Extract provinces
    print("Extracting provinces...")
    provinces = extract_provinces(topology, decoded_arcs)
    print(f"Extracted {len(provinces)} provinces")
    for p in provinces:
        print(f"  - {p['name']} ({len(p['paths'])} path(s))")
    print()

    # Step 4: Extract island dots
    print("Extracting Hoàng Sa islands...")
    hoang_sa_dots = extract_island_dots(topology, decoded_arcs, "gadm36_XPI_0")
    print(f"  Found {len(hoang_sa_dots)} island dots")

    print("Extracting Trường Sa islands...")
    truong_sa_dots = extract_island_dots(topology, decoded_arcs, "gadm36_XSP_0")
    print(f"  Found {len(truong_sa_dots)} island dots")
    print()

    # Step 5: Extract named islands
    print("Extracting named islands...")
    named_islands: list[dict[str, Any]] = []
    for island in NAMED_ISLANDS:
        print(f"  Looking for {island['name']} in {island['province']}...")
        path, center = find_island_polygon(provinces, island)
        named_islands.append(
            {"name": island["name"], "path": path, "center": center}
        )
        status = "found polygon" if path else "dot only"
        print(f"    {status} at ({center[0]}, {center[1]})")

    # Côn Đảo (dot only)
    con_dao_center = project(CON_DAO["lon"], CON_DAO["lat"])
    named_islands.append(
        {"name": CON_DAO["name"], "path": None, "center": con_dao_center}
    )
    print(f"  Côn Đảo: dot only at ({con_dao_center[0]}, {con_dao_center[1]})")
    print()

    # Step 6: Project city coordinates
    print("Projecting city coordinates...")
    projected_cities: list[dict[str, Any]] = []
    for city in CITIES:
        x, y = project(city["lon"], city["lat"])
        projected_cities.append(
            {"name": city["name"], "x": x, "y": y, "primary": city["primary"]}
        )
        print(f"  {city['name']}: ({x}, {y})")
    print()

    # Step 7: Generate TypeScript
    print("Generating TypeScript...")
    ts_content = generate_typescript(
        # Strip internal polygon data before passing
        [{"name": p["name"], "paths": p["paths"]} for p in provinces],
        hoang_sa_dots,
        truong_sa_dots,
        named_islands,
        projected_cities,
    )

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(ts_content)

    file_size = os.path.getsize(OUTPUT_PATH)
    print(f"Written to {OUTPUT_PATH}")
    print(f"File size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")
    print()

    # Step 8: Verify
    province_count = len(provinces)
    has_ba_ria = any("Bà Rịa \u2013" in p["name"] for p in provinces)
    has_hue = any("Thừa Thiên \u2013" in p["name"] for p in provinces)
    has_hoa_binh = any("Hòa Bình" in p["name"] for p in provinces)

    print("=== Verification ===")
    print(f"Provinces: {province_count} (expected 63)")
    print(f"Legal name 'Bà Rịa –': {'OK' if has_ba_ria else 'MISSING'}")
    print(f"Legal name 'Thừa Thiên –': {'OK' if has_hue else 'MISSING'}")
    print(f"Legal name 'Hòa Bình': {'OK' if has_hoa_binh else 'MISSING'}")
    print(f"Hoàng Sa dots: {len(hoang_sa_dots)} (expected 19)")
    print(f"Trường Sa dots: {len(truong_sa_dots)} (expected 11)")
    print(f"Named islands: {len(named_islands)} (expected 7)")

    if province_count != 63:
        print(f"\nWARNING: Expected 63 provinces, got {province_count}")
        sys.exit(1)

    print("\nDone!")


if __name__ == "__main__":
    main()
