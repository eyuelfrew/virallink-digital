/** Build a Google Maps embed URL from coordinates — no API key required. */

export function hasCoordinates(company) {
  const lat = Number(company?.latitude);
  const lng = Number(company?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

/**
 * The keyless embed endpoint. `output=embed` renders a bare map in an iframe;
 * `q` centres the pin on the coordinates, `z` sets zoom. Coordinates are
 * numeric-validated before they reach the URL, so nothing user-supplied can be
 * injected into it.
 */
export function mapEmbedUrl(company, zoom = 15) {
  if (!hasCoordinates(company)) return null;

  const lat = Number(company.latitude);
  const lng = Number(company.longitude);
  const params = new URLSearchParams({
    q: `${lat},${lng}`,
    z: String(zoom),
    output: 'embed',
  });
  return `https://www.google.com/maps?${params.toString()}`;
}

/** The same location as a normal Google Maps page, for a "Directions" link. */
export function mapLinkUrl(company) {
  if (!hasCoordinates(company)) return null;

  const lat = Number(company.latitude);
  const lng = Number(company.longitude);
  const params = new URLSearchParams({ api: '1', query: `${lat},${lng}` });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
