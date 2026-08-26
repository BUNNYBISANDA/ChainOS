"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as maplibregl from "maplibre-gl";
import type { NetworkPoint, NetworkShipmentPoint } from "@/lib/types";

export interface NetworkMapProps {
  suppliers: NetworkPoint[];
  warehouses: NetworkPoint[];
  customers: NetworkPoint[];
  activeShipments: NetworkShipmentPoint[];
  currentQuery: string;
}

/**
 * Supply Chain Network Map (spec §23) — suppliers, warehouses, customers,
 * and active shipments, using only coordinates the backend actually has on
 * file (see ControlTowerService.network()). No route geometry is drawn —
 * only point markers — since ChainOS has no real routing data, and drawing
 * a straight line would read as a fabricated route rather than a
 * relationship.
 */
export function NetworkMap({ suppliers, warehouses, customers, activeShipments, currentQuery }: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const allPoints = [
    ...suppliers.map((p) => ({ ...p, kind: "Supplier" as const })),
    ...warehouses.map((p) => ({ ...p, kind: "Warehouse" as const })),
    ...customers.map((p) => ({ ...p, kind: "Customer" as const })),
    ...activeShipments.map((s) => ({ id: s.id, label: `${s.shipmentNumber} (${s.direction})`, latitude: s.latitude, longitude: s.longitude, kind: "Shipment" as const })),
  ];

  useEffect(() => {
    if (!containerRef.current || allPoints.length === 0) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "OpenStreetMap contributors" },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [allPoints[0].longitude, allPoints[0].latitude],
      zoom: 3,
    });

    const bounds = new maplibregl.LngLatBounds();
    for (const point of allPoints) {
      bounds.extend([point.longitude, point.latitude]);
      const marker = new maplibregl.Marker({ color: colorForKind(point.kind) })
        .setLngLat([point.longitude, point.latitude])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setText(`${point.kind}: ${point.label}`))
        .addTo(map);
      marker.getElement().setAttribute("aria-label", `${point.kind}: ${point.label}`);
      if (point.kind === "Warehouse") {
        marker.getElement().style.cursor = "pointer";
        marker.getElement().addEventListener("click", () => {
          const params = new URLSearchParams(currentQuery);
          params.set("warehouse", point.id);
          router.push(`/control-tower?${params.toString()}`);
        });
      }
    }

    if (allPoints.length > 1) {
      map.on("load", () => map.fitBounds(bounds, { padding: 48, maxZoom: 6 }));
    }

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers, warehouses, customers, activeShipments]);

  if (allPoints.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-md border border-dashed border-border bg-surface-subtle text-sm text-ink-faint">
        No suppliers, warehouses, or customers have coordinates on file yet.
      </div>
    );
  }

  return <div ref={containerRef} className="h-96 rounded-md border border-border" aria-label="Supply chain network map" />;
}

function colorForKind(kind: "Supplier" | "Warehouse" | "Customer" | "Shipment"): string {
  if (kind === "Warehouse") return "#7c3aed";
  if (kind === "Customer") return "#16a34a";
  if (kind === "Shipment") return "#d97706";
  return "#2563eb";
}
