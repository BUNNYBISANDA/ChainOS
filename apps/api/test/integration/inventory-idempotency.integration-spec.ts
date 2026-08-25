import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { ReservationStatus, withTenant } from "@chainos/database";
import { InventoryService } from "../../src/modules/inventory/inventory.service";
import { PoReceivedPayload, SalesOrderFulfilledPayload } from "../../src/common/events/domain-events";
import {
  TestTenant,
  cleanupTestTenant,
  createTestApp,
  createTestTenant,
  seedCustomer,
  seedProduct,
  seedPurchaseOrder,
  seedSalesOrder,
  seedSupplier,
  seedWarehouse,
} from "./helpers";

describe("Inventory idempotency (po.received) against real Postgres", () => {
  let app: INestApplication;
  let tenant: TestTenant;
  let inventory: InventoryService;
  let warehouseId: string;
  let productId: string;
  let purchaseOrderId: string;
  let purchaseOrderLineId: string;
  let goodsReceiptLineId: string;

  beforeAll(async () => {
    app = await createTestApp();
    inventory = app.get(InventoryService);
    tenant = await createTestTenant("idem");
    const warehouse = await seedWarehouse(tenant.tenantId, "Idempotency Test Warehouse");
    const product = await seedProduct(tenant.tenantId, "SKU-IDEM-1", "Idempotency Test Product");
    const supplier = await seedSupplier(tenant.tenantId, "Idempotency Test Supplier");
    // StockMovement.purchaseOrderLineId / goodsReceiptLineId are real FKs
    // — every event payload below reuses this one PO line and one
    // GoodsReceiptLine (a test fixture, not a distinct receipt per
    // event). InventoryService never validates qty against the PO's own
    // qtyOrdered (that check lives in PurchaseOrdersService.receive, not
    // in the event handler).
    const po = await seedPurchaseOrder(tenant.tenantId, supplier.id, warehouse.id, product.id, 10000);
    warehouseId = warehouse.id;
    productId = product.id;
    purchaseOrderId = po.id;
    purchaseOrderLineId = po.lines[0].id;

    goodsReceiptLineId = await withTenant(tenant.tenantId, async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: { tenantId: tenant.tenantId, purchaseOrderId, warehouseId },
      });
      const line = await tx.goodsReceiptLine.create({
        data: { tenantId: tenant.tenantId, goodsReceiptId: receipt.id, purchaseOrderLineId, productId, qtyReceived: 0 },
      });
      return line.id;
    });
  }, 90000);

  afterAll(async () => {
    await cleanupTestTenant(tenant.tenantId);
    await app.close();
  });

  function payload(eventId: string, qty: number): PoReceivedPayload {
    return {
      eventId,
      tenantId: tenant.tenantId,
      purchaseOrderId,
      warehouseId,
      receiptId: randomUUID(),
      receivedAt: new Date().toISOString(),
      lines: [{ purchaseOrderLineId, goodsReceiptLineId, productId, qtyReceived: qty }],
    };
  }

  async function stockOnHand(): Promise<number> {
    const level = await withTenant(tenant.tenantId, (tx) =>
      tx.stockLevel.findFirst({ where: { productId, warehouseId, locationId: null } }),
    );
    return level?.quantityOnHand ?? 0;
  }

  async function movementCount(): Promise<number> {
    return withTenant(tenant.tenantId, (tx) => tx.stockMovement.count({ where: { productId, warehouseId } }));
  }

  it("processing the same eventId twice (sequential redelivery) results in +1000, not +2000", async () => {
    const evt = payload(randomUUID(), 1000);

    await inventory.handlePoReceived(evt);
    await inventory.handlePoReceived(evt); // exact redelivery of the same event

    expect(await stockOnHand()).toBe(1000);
    expect(await movementCount()).toBe(1);
  });

  it("processing the same eventId twice CONCURRENTLY still results in only one applied receipt", async () => {
    const evt = payload(randomUUID(), 250);

    await Promise.all([inventory.handlePoReceived(evt), inventory.handlePoReceived(evt)]);

    expect(await stockOnHand()).toBe(1000 + 250); // cumulative on top of the previous test
    expect(await movementCount()).toBe(2); // 1 from the previous test + 1 from this one
  });

  it("two genuinely different events are both applied (not deduped)", async () => {
    await inventory.handlePoReceived(payload(randomUUID(), 300));
    await inventory.handlePoReceived(payload(randomUUID(), 300));

    expect(await stockOnHand()).toBe(1000 + 250 + 300 + 300);
    expect(await movementCount()).toBe(4);
  });

  it("recorded a ProcessedEvent row per unique eventId, not per handler invocation", async () => {
    const count = await withTenant(tenant.tenantId, (tx) => tx.processedEvent.count({ where: { tenantId: tenant.tenantId } }));
    // 4 unique eventIds were claimed across the tests above: 1 (sequential
    // dup) + 1 (concurrent dup, shares one eventId/claim row) + 2 (two
    // genuinely different events) = 4.
    expect(count).toBe(4);
  });
});

describe("Inventory idempotency (sales-order.fulfilled) against real Postgres", () => {
  let app: INestApplication;
  let tenant: TestTenant;
  let inventory: InventoryService;
  let warehouseId: string;
  let productId: string;
  let salesOrderId: string;
  let salesOrderLineId: string;

  beforeAll(async () => {
    app = await createTestApp();
    inventory = app.get(InventoryService);
    tenant = await createTestTenant("idem-fulfill");
    const warehouse = await seedWarehouse(tenant.tenantId, "Idempotency Fulfill Warehouse");
    const product = await seedProduct(tenant.tenantId, "SKU-IDEM-FULFILL-1", "Idempotency Fulfill Product");
    const customer = await seedCustomer(tenant.tenantId, "Idempotency Fulfill Customer");
    warehouseId = warehouse.id;
    productId = product.id;

    // Fixture state equivalent to what a real allocate() call would leave
    // behind: 1000 on hand, 200 reserved against one ACTIVE reservation —
    // set up directly (not through allocate()) since this test only
    // exercises the async fulfillment handler in isolation, the same way
    // the po.received tests above only exercise handlePoReceived directly.
    const salesOrder = await seedSalesOrder(tenant.tenantId, customer.id, warehouseId, productId, 200);
    salesOrderId = salesOrder.id;
    salesOrderLineId = salesOrder.lines[0].id;

    await withTenant(tenant.tenantId, async (tx) => {
      await tx.stockLevel.create({
        data: { tenantId: tenant.tenantId, productId, warehouseId, quantityOnHand: 1000, quantityReserved: 200 },
      });
      await tx.salesOrderLine.update({ where: { id: salesOrderLineId }, data: { qtyReserved: 200 } });
      await tx.inventoryReservation.create({
        data: {
          tenantId: tenant.tenantId,
          salesOrderId,
          salesOrderLineId,
          productId,
          warehouseId,
          quantity: 200,
          status: ReservationStatus.ACTIVE,
        },
      });
    });
  }, 90000);

  afterAll(async () => {
    await cleanupTestTenant(tenant.tenantId);
    await app.close();
  });

  function payload(eventId: string, qty: number): SalesOrderFulfilledPayload {
    return {
      eventId,
      tenantId: tenant.tenantId,
      salesOrderId,
      warehouseId,
      lines: [{ salesOrderLineId, productId, qty }],
    };
  }

  async function stockOnHand(): Promise<number> {
    const level = await withTenant(tenant.tenantId, (tx) =>
      tx.stockLevel.findFirst({ where: { productId, warehouseId, locationId: null } }),
    );
    return level?.quantityOnHand ?? 0;
  }

  async function movementCount(): Promise<number> {
    return withTenant(tenant.tenantId, (tx) =>
      tx.stockMovement.count({ where: { productId, warehouseId, salesOrderLineId } }),
    );
  }

  it("replaying the same sales-order.fulfilled eventId twice results in -100, not -200", async () => {
    const evt = payload(randomUUID(), 100);

    await inventory.handleSalesOrderFulfilled(evt);
    await inventory.handleSalesOrderFulfilled(evt); // duplicate redelivery of the SAME event

    expect(await stockOnHand()).toBe(900); // 1000 - 100, not 1000 - 200
    expect(await movementCount()).toBe(1);

    const reservation = await withTenant(tenant.tenantId, (tx) =>
      tx.inventoryReservation.findUnique({ where: { salesOrderLineId } }),
    );
    expect(reservation?.fulfilledQuantity).toBe(100); // not double-applied either
  });

  it("replaying the same eventId CONCURRENTLY still applies the delta exactly once", async () => {
    const evt = payload(randomUUID(), 50);

    await Promise.all([inventory.handleSalesOrderFulfilled(evt), inventory.handleSalesOrderFulfilled(evt)]);

    expect(await stockOnHand()).toBe(850); // 900 - 50, not 900 - 100
    expect(await movementCount()).toBe(2); // 1 from the previous test + 1 from this one
  });
});
