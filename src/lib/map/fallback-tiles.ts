/**
 * Basemap for the Leaflet fallback, used only when Mapbox is unavailable.
 *
 * CARTO's `dark_all` basemap now answers keyless requests with an
 * "API KEY REQUIRED" tile, so the fallback uses the OpenStreetMap standard
 * tile server (keyless; light use with attribution is within its policy).
 * Those tiles are light, so FALLBACK_TILE_CLASS darkens them in globals.css.
 */
export const FALLBACK_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const FALLBACK_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const FALLBACK_TILE_CLASS = 'evoyage-fallback-tiles';
