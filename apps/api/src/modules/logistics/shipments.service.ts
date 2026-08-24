import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { ShipmentStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { DomainEvent, OrderReadyPayload, ShipmentDeliveredPayload } from "../../common/events/domain-events";
import { CreateShipmentDto } from "./dto/create-shipment.dto";

/**
 * Owns: shipments, carriers, tracking events (manifest §2). v1 tracking is
 * manual (decisions locked, §5) — dispatch()/deliver() are called by a
 * human via the API, not by a carrier webhook.
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly events: EventEmitter2,
  ) {}

  create(dto: CreateShipmentDto) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) =>
      tx.shipment.create({
        data: { tenantId, ...dto },
        include: { events: true },
      }),
    );
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.shipment.findMany({ where: { tenantId }, include: { events: true } }));
  }

  async dispatch(shipmentId: string) {
    const { tenantId } = this.tenantContext.get();
    await this.setStatus(tenantId, shipmentId, ShipmentStatus.DISPATCHED);
    this.events.emit(DomainEvent.ShipmentDispatched, { tenantId, shipmentId });
    return { tenantId, shipmentId, status: ShipmentStatus.DISPATCHED };
  }

  async deliver(shipmentId: string) {
    const { tenantId } = this.tenantContext.get();
    const shipment = await this.setStatus(tenantId, shipmentId, ShipmentStatus.DELIVERED);

    const payload: ShipmentDeliveredPayload = {
      tenantId,
      shipmentId,
      purchaseOrderId: shipment.purchaseOrderId ?? undefined,
      customerOrderId: shipment.customerOrderId ?? undefined,
    };
    this.events.emit(DomainEvent.ShipmentDelivered, payload);
    return payload;
  }

  private async setStatus(tenantId: string, shipmentId: string, status: ShipmentStatus) {
    return withTenant(tenantId, async (tx) => {
      const shipment = await tx.shipment.findFirst({ where: { id: shipmentId, tenantId } });
      if (!shipment) throw new NotFoundException("Shipment not found");
      await tx.shipment.update({ where: { id: shipmentId }, data: { status } });
      await tx.shipmentEvent.create({ data: { tenantId, shipmentId, status } });
      return shipment;
    });
  }

  @OnEvent(DomainEvent.OrderReady)
  onOrderReady(payload: OrderReadyPayload) {
    // Placeholder: phase 1 ships this as a manual "create shipment" call
    // (see decisions locked, §5). Auto-creating an outbound Shipment here
    // is the natural phase-1.5 follow-up once manual tracking is proven out.
    this.logger.debug(`order.ready observed for customer order ${payload.customerOrderId} — shipment creation is manual in v1`);
  }
}
