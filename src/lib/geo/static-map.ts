/**
 * Build Mapbox Static Images API URLs for trip share cards.
 */

export interface StaticMapMarker {
  readonly lng: number;
  readonly lat: number;
  readonly label: string;
  readonly color: string; // hex without #
}

export interface StaticMapOptions {
  readonly polyline: string; // encoded polyline (precision 5)
  readonly markers: readonly StaticMapMarker[];
  readonly width: number;
  readonly height: number;
  readonly accessToken: string;
  readonly style?: string;
}

const MAX_URL_LENGTH = 8192;
const DEFAULT_STYLE = 'mapbox/dark-v11';

function formatMarker(marker: StaticMapMarker): string {
  return `pin-s-${marker.label}+${marker.color}(${marker.lng},${marker.lat})`;
}

function formatPathOverlay(polyline: string): string {
  return `path-3+3b82f6-0.8(${encodeURIComponent(polyline)})`;
}

/**
 * Build a Mapbox Static Images API URL.
 *
 * URL format:
 *   https://api.mapbox.com/styles/v1/{style}/static/{overlays}/auto/{width}x{height}@2x
 *   ?access_token={token}&padding=40
 *
 * @throws Error if the resulting URL exceeds 8192 characters
 */
export function buildStaticMapUrl(options: StaticMapOptions): string {
  const style = options.style ?? DEFAULT_STYLE;
  const overlays = [
    formatPathOverlay(options.polyline),
    ...options.markers.map(formatMarker),
  ].join(',');

  const url = `https://api.mapbox.com/styles/v1/${style}/static/${overlays}/auto/${options.width}x${options.height}@2x?access_token=${options.accessToken}&padding=40`;

  if (url.length > MAX_URL_LENGTH) {
    throw new Error(
      `Static map URL exceeds maximum length of ${MAX_URL_LENGTH} characters (got ${url.length})`,
    );
  }

  return url;
}
