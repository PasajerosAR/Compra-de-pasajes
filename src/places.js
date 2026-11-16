export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function placeLabel(place) {
  return place.province ? `${place.place_name} · ${place.province}` : place.place_name;
}

export function findPlaceByInput(value, places) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const labelMatches = places.filter((place) => normalizeText(placeLabel(place)) === normalized);
  if (labelMatches.length === 1) return labelMatches[0];
  if (labelMatches.length > 1) return null;

  const nameMatches = places.filter((place) => normalizeText(place.place_name) === normalized);
  return nameMatches.length === 1 ? nameMatches[0] : null;
}
