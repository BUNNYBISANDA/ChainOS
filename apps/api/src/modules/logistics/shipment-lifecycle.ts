import { ShipmentStatus } from "@chainos/database";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { BadRequestAppException } from "../../common/errors/app-exception";

/**
 * CREATED -> BOOKED -> IN_TRANSIT -> ARRIVED -> DELIVERED, with CANCELLED
 * reachable up through IN_TRANSIT (not once physically ARRIVED/DELIVERED
 * — see docs/adr/0004-purchase-order-lifecycle.md). Tracking is manual
 * (v1 decision) — these transitions are driven by a human clicking a
 * button, not a carrier webhook.
 */
const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.CREATED]: [ShipmentStatus.BOOKED, ShipmentStatus.CANCELLED],
  [ShipmentStatus.BOOKED]: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
  [ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.ARRIVED, ShipmentStatus.CANCELLED],
  [ShipmentStatus.ARRIVED]: [ShipmentStatus.DELIVERED],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.CANCELLED]: [],
};

export function assertShipmentTransition(current: ShipmentStatus, target: ShipmentStatus): void {
  if (!TRANSITIONS[current].includes(target)) {
    throw new BadRequestAppException(
      AppErrorCode.SHIPMENT_INVALID_TRANSITION,
      `Shipment cannot move from ${current} to ${target}`,
    );
  }
}
