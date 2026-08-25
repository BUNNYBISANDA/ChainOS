-- Phase 3: shipment visibility, manual tracking, ETA, and exceptions.

CREATE TYPE "ShipmentEventType" AS ENUM (
  'CREATED',
  'BOOKED',
  'DISPATCHED',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
  'CANCELLED',
  'DELAYED',
  'ETA_UPDATED',
  'LOCATION_UPDATED',
  'NOTE_ADDED'
);

CREATE TYPE "TrackingEventSource" AS ENUM ('SYSTEM', 'MANUAL', 'PROVIDER');
CREATE TYPE "ShipmentExceptionType" AS ENUM ('ETA_EXCEEDED', 'TRACKING_STALE', 'NOT_DISPATCHED', 'ARRIVAL_OVERDUE');
CREATE TYPE "ShipmentExceptionSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "ShipmentExceptionStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "shipments"
  ADD COLUMN "originName" TEXT,
  ADD COLUMN "originLatitude" DECIMAL(65,30),
  ADD COLUMN "originLongitude" DECIMAL(65,30),
  ADD COLUMN "destinationName" TEXT,
  ADD COLUMN "destinationLatitude" DECIMAL(65,30),
  ADD COLUMN "destinationLongitude" DECIMAL(65,30),
  ADD COLUMN "currentLocationName" TEXT,
  ADD COLUMN "currentLatitude" DECIMAL(65,30),
  ADD COLUMN "currentLongitude" DECIMAL(65,30),
  ADD COLUMN "plannedDepartureAt" TIMESTAMP(3),
  ADD COLUMN "plannedArrivalAt" TIMESTAMP(3),
  ADD COLUMN "actualDepartureAt" TIMESTAMP(3),
  ADD COLUMN "actualArrivalAt" TIMESTAMP(3),
  ADD COLUMN "estimatedArrivalAt" TIMESTAMP(3),
  ADD COLUMN "lastTrackingEventAt" TIMESTAMP(3);

ALTER TABLE "shipment_events"
  ALTER COLUMN "status" DROP NOT NULL,
  ADD COLUMN "eventType" "ShipmentEventType" NOT NULL DEFAULT 'CREATED',
  ADD COLUMN "eventTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "locationName" TEXT,
  ADD COLUMN "latitude" DECIMAL(65,30),
  ADD COLUMN "longitude" DECIMAL(65,30),
  ADD COLUMN "source" "TrackingEventSource" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "shipment_events"
SET
  "eventType" = CASE "status"::text
    WHEN 'CREATED' THEN 'CREATED'::"ShipmentEventType"
    WHEN 'BOOKED' THEN 'BOOKED'::"ShipmentEventType"
    WHEN 'IN_TRANSIT' THEN 'DISPATCHED'::"ShipmentEventType"
    WHEN 'ARRIVED' THEN 'ARRIVED'::"ShipmentEventType"
    WHEN 'DELIVERED' THEN 'DELIVERED'::"ShipmentEventType"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"ShipmentEventType"
    ELSE 'CREATED'::"ShipmentEventType"
  END,
  "eventTimestamp" = "occurredAt",
  "notes" = "note",
  "createdAt" = "occurredAt";

UPDATE "shipments" s
SET "lastTrackingEventAt" = COALESCE(
  (
    SELECT MAX(e."eventTimestamp")
    FROM "shipment_events" e
    WHERE e."shipmentId" = s."id"
  ),
  s."createdAt"
);

CREATE INDEX "shipment_events_tenantId_shipmentId_eventType_source_idx"
  ON "shipment_events"("tenantId", "shipmentId", "eventType", "source");

CREATE TABLE "shipment_exceptions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "type" "ShipmentExceptionType" NOT NULL,
  "severity" "ShipmentExceptionSeverity" NOT NULL,
  "status" "ShipmentExceptionStatus" NOT NULL DEFAULT 'OPEN',
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shipment_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shipment_exceptions_tenantId_idx" ON "shipment_exceptions"("tenantId");
CREATE INDEX "shipment_exceptions_shipmentId_idx" ON "shipment_exceptions"("shipmentId");
CREATE INDEX "shipment_exceptions_tenantId_shipmentId_type_status_idx"
  ON "shipment_exceptions"("tenantId", "shipmentId", "type", "status");

ALTER TABLE "shipment_exceptions"
  ADD CONSTRAINT "shipment_exceptions_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
