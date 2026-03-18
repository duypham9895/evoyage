const MAPBOX_MATRIX_BASE_URL =
  'https://api.mapbox.com/directions-matrix/v1/mapbox/driving';
const MAX_DESTINATIONS = 24;
const REQUEST_TIMEOUT_MS = 10_000;

export interface MatrixResult {
  readonly durations: readonly number[];
  readonly distances: readonly number[];
}

/**
 * Fetches drive-time and distance from a single source to multiple destinations
 * using the Mapbox Directions Matrix API.
 *
 * @param source       Origin coordinate
 * @param destinations Up to 24 destination coordinates
 * @param accessToken  Mapbox access token
 * @returns Durations (seconds) and distances (meters) for each destination
 */
export async function fetchMatrixDurations(
  source: { lat: number; lng: number },
  destinations: readonly { lat: number; lng: number }[],
  accessToken: string,
): Promise<MatrixResult> {
  if (destinations.length === 0) {
    return { durations: [], distances: [] };
  }

  if (destinations.length > MAX_DESTINATIONS) {
    throw new Error(
      `Too many destinations: ${destinations.length}. Maximum is ${MAX_DESTINATIONS}.`,
    );
  }

  // Mapbox uses lng,lat (GeoJSON order)
  const sourceCoord = `${source.lng},${source.lat}`;
  const destCoords = destinations
    .map((d) => `${d.lng},${d.lat}`)
    .join(';');

  const allCoords = `${sourceCoord};${destCoords}`;
  const url = `${MAPBOX_MATRIX_BASE_URL}/${allCoords}?sources=0&annotations=duration,distance&access_token=${accessToken}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(
        `Mapbox Matrix API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      readonly code: string;
      readonly durations: readonly (readonly number[])[];
      readonly distances: readonly (readonly number[])[];
    };

    if (data.code !== 'Ok') {
      throw new Error(`Mapbox Matrix API returned code: ${data.code}`);
    }

    // Extract row 0 (source → each destination)
    return {
      durations: data.durations[0],
      distances: data.distances[0],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
