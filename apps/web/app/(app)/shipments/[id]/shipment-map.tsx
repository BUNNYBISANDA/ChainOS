"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";

export interface ShipmentMapPoint {
  label: string;
  kind: "Origin" | "Current" | "Destination";
  latitude: number;
  longitude: number;
}

export function ShipmentMap({ points }: { points: ShipmentMapPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [points[0].longitude, points[0].latitude],
      zoom: points.length === 1 ? 8 : 4,
    });

    const bounds = new maplibregl.LngLatBounds();
    for (const point of points) {
      bounds.extend([point.longitude, point.latitude]);
      const marker = new maplibregl.Marker({ color: colorForKind(point.kind) })
        .setLngLat([point.longitude, point.latitude])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText(`${point.kind}: ${point.label}`))
        .addTo(map);
      marker.getElement().setAttribute("aria-label", `${point.kind}: ${point.label}`);
    }

    map.on("load", () => {
      if (points.length > 1) {
        const routeSource: maplibregl.GeoJSONSourceSpecification = {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: points.map((point) => [point.longitude, point.latitude]),
            },
          },
        };
        map.addSource("shipment-direction", routeSource);
        map.addLayer({
          id: "shipment-direction",
          type: "line",
          source: "shipment-direction",
          paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 2] },
        });
        map.fitBounds(bounds, { padding: 56, maxZoom: 9 });
      }
    });

    return () => map.remove();
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border bg-surface-subtle text-sm text-ink-faint">
        No coordinates available for this shipment yet.
      </div>
    );
  }

  return <div ref={containerRef} className="h-72 rounded-md border border-border" aria-label="Shipment map" />;
}

function colorForKind(kind: ShipmentMapPoint["kind"]): string {
  if (kind === "Current") return "#d97706";
  if (kind === "Destination") return "#16a34a";
  return "#2563eb";
}
