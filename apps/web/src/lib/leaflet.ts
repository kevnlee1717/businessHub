import L from "leaflet";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: icon,
  shadowUrl: shadow
});

const ONEMAP_TILE = "https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png";
const ONEMAP_ATTR = '<a href="https://www.onemap.gov.sg/" target="_blank">OneMap</a>';

export type LeafletMap = L.Map;
export type LeafletMouseEvent = L.LeafletMouseEvent;

export function createMap(container: HTMLElement, opts?: { center?: [number, number]; zoom?: number }): L.Map {
  const map = L.map(container, {
    center: opts?.center ?? [1.3521, 103.8198],
    zoom: opts?.zoom ?? 12
  });
  L.tileLayer(ONEMAP_TILE, { attribution: ONEMAP_ATTR, maxZoom: 18 }).addTo(map);
  return map;
}

export { L };
