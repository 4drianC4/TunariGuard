import * as L from 'leaflet';

export function addOpenStreetMap(map: L.Map): void {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
}

export function addBoliviaBasemap(map: L.Map): void {
  const bounds = L.latLngBounds([-22.872919, -69.590424], [-9.761988, -57.498371]);
  map.options.maxBoundsViscosity = 1;
  map.setMaxBounds(bounds);
  const countrySize = map.project(bounds.getSouthEast(), 0).subtract(map.project(bounds.getNorthWest(), 0));

  const setMinimumZoom = () => {
    const viewport = map.getSize();
    if (!viewport.x || !viewport.y) return;
    const scale = Math.min(viewport.x / countrySize.x, viewport.y / countrySize.y);
    map.setMinZoom(Math.max(0, Math.floor(map.getScaleZoom(scale, 0))));
  };

  setMinimumZoom();
  map.on('resize', setMinimumZoom);
  addOpenStreetMap(map);
}
