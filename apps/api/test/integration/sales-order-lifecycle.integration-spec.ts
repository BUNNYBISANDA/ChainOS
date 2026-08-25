import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as bcrypt from "bcryptjs";
import { StockMovementType, withTenant } from "@chainos/database";
import {
  ALL_PERMISSIONS,
  TestTenant,
  cleanupTestTenant,
  createTestApp,
  createTestTenant,
  getStockReconciliation,
  loginTestTenant,
  seedCustomer,
  seedProduct,
  seedWarehouse,
} from "./helpers";

/**
 * End-to-end over real Postgres: the whole outbound slice — Customer ->
 * Sales Order -> Confirm -> Allocate (reservation) -> Fulfill (partial and
 * full) -> Cancel, driven through the real HTTP API. Covers the phase 2
 * DoD test list (mandatory scenarios 1, 2, 4, 5, 7 and the permission
 * matrix; scenario 3 — concurrent allocation — lives in
 * inventory-reservation-concurrency.integration-spec.ts, and scenario 6 —
 * duplicate fulfillment event — extends inventory-idempotency.integration-spec.ts).
 */
describe("Sales order lifecycle (create -> confirm -> allocate -> fulfill / cancel)", () => {
  let app: INestApplication;
  let tenant: TestTenant;
  let token: string;
  let customerId: string;
  let warehouseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTestTenant("so-lifecycle");
    token = await loginTestTenant(app, tenant);

    const warehouse = await seedWarehouse(tenant.tenantId, "SO Lifecycle Test Warehouse");
    const customer = await seedCustomer(tenant.tenantId, "SO Lifecycle Test Customer");
    warehouseId = warehouse.id;
    customerId = customer.id;
  }, 90000);

  afterAll(async () => {
    await cleanupTestTenant(tenant.tenantId);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Seeds on-hand stock directly via a RECEIPT movement — no PO/GoodsReceipt fixture needed, since those FKs are nullable. */
  async function seedStock(productId: string, qty: number) {
    await withTenant(tenant.tenantId, async (tx) => {
      await tx.stockMovement.create({
        data: { tenantId: tenant.tenantId, productId, warehouseId, type: StockMovementType.RECEIPT, quantityDelta: qty },
      });
      await tx.stockLevel.create({
        data: { tenantId: tenant.tenantId, productId, warehouseId, quantityOnHand: qty, quantityReserved: 0 },
      });
    });
  }

  async function createOrder(productId: string, qty: number, unitPrice = 20) {
    const res = await request(app.getHttpServer())
      .post("/sales-orders")
      .set(auth())
      .send({ customerId, warehouseId, lines: [{ productId, qtyOrdered: qty, unitPrice }] })
      .expect(201);
    return res.body as { id: string; orderNumber: string; status: string; lines: Array<{ id: string; productId: string }> };
  }

  it("full happy path: create -> confirm -> allocate -> partially fulfill -> fully fulfill, SO number is human-readable", async () => {
    const product = await seedProduct(tenant.tenantId, "SKU-SO-HAPPY-1", "SO Happy Path Product");
    await seedStock(product.id, 1000);

    const order = await createOrder(product.id, 600);
    expect(order.orderNumber).toMatch(/^SO-\d{4}-\d{6}$/);
    expect(order.status).toBe("DRAFT");
    const lineId = order.lines[0].id;

    const confirmed = await request(app.getHttpServer()).post(`/sales-orders/${order.id}/confirm`).set(auth()).expect(201);
    expect(confirmed.body.status).toBe("CONFIRMED");
    expect(confirmed.body.confirmedByUserId).toBe(tenant.userId);
    expect(confirmed.body.confirmedAt).toBeTruthy();

    const allocated = await request(app.getHttpServer()).post(`/sales-orders/${order.id}/allocate`).set(auth()).expect(201);
    expect(allocated.body.status).toBe("ALLOCATED");
    expect(allocated.body.lines[0].qtyReserved).toBe(600);

    let recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.onHand).toBe(1000);
    expect(recon.reserved).toBe(600);
    expect(recon.available).toBe(400);
    expect(recon.onHand).toBe(recon.movementSum); // reservation never posts a movement

    const firstFulfill = await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/fulfill`)
      .set(auth())
      .send({ lines: [{ salesOrderLineId: lineId, qty: 400 }] })
      .expect(201);
    expect(firstFulfill.body.status).toBe("PARTIALLY_FULFILLED");
    expect(firstFulfill.body.lines[0].qtyFulfilled).toBe(400);
    expect(firstFulfill.body.lines[0].remaining).toBe(200);

    recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.onHand).toBe(600);
    expect(recon.reserved).toBe(200);
    expect(recon.available).toBe(400);
    expect(recon.onHand).toBe(recon.movementSum);

    const secondFulfill = await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/fulfill`)
      .set(auth())
      .send({ lines: [{ salesOrderLineId: lineId, qty: 200 }] })
      .expect(201);
    expect(secondFulfill.body.status).toBe("FULFILLED");
    expect(secondFulfill.body.lines[0].remaining).toBe(0);

    recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.onHand).toBe(400);
    expect(recon.reserved).toBe(0);
    expect(recon.available).toBe(400);
    expect(recon.onHand).toBe(recon.movementSum);

    // Ledger: two FULFILLMENT movements against this line, totalling -600.
    const outboundTotal = await withTenant(tenant.tenantId, (tx) =>
      tx.stockMovement.aggregate({ where: { salesOrderLineId: lineId }, _sum: { quantityDelta: true } }),
    );
    expect(outboundTotal._sum.quantityDelta).toBe(-600);
  });

  it("insufficient stock: allocating more than available fails, and no reservation remains", async () => {
    const product = await seedProduct(tenant.tenantId, "SKU-SO-INSUFFICIENT-1", "SO Insufficient Stock Product");
    await seedStock(product.id, 100);

    const order = await createOrder(product.id, 150);
    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/confirm`).set(auth()).expect(201);

    const res = await request(app.getHttpServer()).post(`/sales-orders/${order.id}/allocate`).set(auth()).expect(400);
    expect(res.body.code).toBe("INVENTORY_INSUFFICIENT_AVAILABLE_STOCK");
    expect(res.body.details).toMatchObject({ productId: product.id, warehouseId, requested: 150, available: 100 });

    const after = await request(app.getHttpServer()).get(`/sales-orders/${order.id}`).set(auth()).expect(200);
    expect(after.body.status).toBe("CONFIRMED"); // never advanced to ALLOCATED

    const reservationCount = await withTenant(tenant.tenantId, (tx) =>
      tx.inventoryReservation.count({ where: { salesOrderId: order.id } }),
    );
    expect(reservationCount).toBe(0);

    const recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.reserved).toBe(0);
    expect(recon.onHand).toBe(100);
  });

  it("cancelling before fulfillment releases the full reservation and creates no stock movement", async () => {
    const product = await seedProduct(tenant.tenantId, "SKU-SO-CANCEL-1", "SO Full Cancel Product");
    await seedStock(product.id, 1000);

    const order = await createOrder(product.id, 600);
    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/confirm`).set(auth()).expect(201);
    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/allocate`).set(auth()).expect(201);

    const cancelled = await request(app.getHttpServer()).post(`/sales-orders/${order.id}/cancel`).set(auth()).expect(201);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.cancelledAt).toBeTruthy();

    const recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.onHand).toBe(1000); // unchanged
    expect(recon.reserved).toBe(0); // fully released
    expect(recon.available).toBe(1000);

    const lineId = order.lines[0].id;
    const outboundMovements = await withTenant(tenant.tenantId, (tx) =>
      tx.stockMovement.count({ where: { salesOrderLineId: lineId } }),
    );
    expect(outboundMovements).toBe(0); // no physical movement for a release

    const reservation = await withTenant(tenant.tenantId, (tx) =>
      tx.inventoryReservation.findFirst({ where: { salesOrderId: order.id } }),
    );
    expect(reservation?.status).toBe("CANCELLED");
    expect(reservation?.releasedAt).toBeTruthy();
  });

  it("cancelling after a partial fulfillment releases only the unfulfilled remainder, keeping fulfilled history", async () => {
    const product = await seedProduct(tenant.tenantId, "SKU-SO-PARTIAL-CANCEL-1", "SO Partial Cancel Product");
    await seedStock(product.id, 1000);

    const order = await createOrder(product.id, 600);
    const lineId = order.lines[0].id;
    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/confirm`).set(auth()).expect(201);
    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/allocate`).set(auth()).expect(201);
    await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/fulfill`)
      .set(auth())
      .send({ lines: [{ salesOrderLineId: lineId, qty: 400 }] })
      .expect(201);

    const cancelled = await request(app.getHttpServer()).post(`/sales-orders/${order.id}/cancel`).set(auth()).expect(201);
    expect(cancelled.body.status).toBe("CANCELLED");

    const recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.onHand).toBe(600); // 1000 - 400 fulfilled, unaffected by the cancel
    expect(recon.reserved).toBe(0); // remaining 200 released
    expect(recon.available).toBe(600);

    // The historical -400 fulfillment movement is untouched (append-only).
    const movements = await withTenant(tenant.tenantId, (tx) =>
      tx.stockMovement.findMany({ where: { salesOrderLineId: lineId } }),
    );
    expect(movements).toHaveLength(1);
    expect(movements[0].quantityDelta).toBe(-400);

    const reservation = await withTenant(tenant.tenantId, (tx) =>
      tx.inventoryReservation.findFirst({ where: { salesOrderId: order.id } }),
    );
    expect(reservation?.fulfilledQuantity).toBe(400); // history preserved
    expect(reservation?.status).toBe("CANCELLED");
  });

  it("over-fulfillment beyond what remains reserved is rejected atomically", async () => {
    const product = await seedProduct(tenant.tenantId, "SKU-SO-OVERFULFILL-1", "SO Over Fulfillment Product");
    await seedStock(product.id, 1000);

    const order = await createOrder(product.id, 600);
    const lineId = order.lines[0].id;
    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/confirm`).set(auth()).expect(201);
    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/allocate`).set(auth()).expect(201);
    await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/fulfill`)
      .set(auth())
      .send({ lines: [{ salesOrderLineId: lineId, qty: 400 }] })
      .expect(201); // 200 remaining reserved

    const res = await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/fulfill`)
      .set(auth())
      .send({ lines: [{ salesOrderLineId: lineId, qty: 201 }] })
      .expect(400);
    expect(res.body.code).toBe("SALES_ORDER_OVER_FULFILLMENT");

    // Nothing partially applied: still PARTIALLY_FULFILLED at 400, stock unchanged since the rejected attempt.
    const after = await request(app.getHttpServer()).get(`/sales-orders/${order.id}`).set(auth()).expect(200);
    expect(after.body.status).toBe("PARTIALLY_FULFILLED");
    expect(after.body.lines[0].qtyFulfilled).toBe(400);

    const recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.onHand).toBe(600);
  });

  it("a Procurement Manager (no sales-order permissions) cannot confirm or allocate a sales order", async () => {
    const email = `procurement-only-${Date.now()}@${tenant.slug}.test`;
    const password = "ProcurementOnly123!";
    const passwordHash = await bcrypt.hash(password, 10);
    // Same shape as the seeded "Procurement Manager" role — must NOT
    // automatically receive sales-order permissions (phase 2 task spec).
    const procurementPermissions = ["procurement:write", "po:create", "po:approve", "po:receive", "catalog:write"];

    await withTenant(tenant.tenantId, async (tx) => {
      const role = await tx.role.create({
        data: { tenantId: tenant.tenantId, name: `Procurement Only ${Date.now()}`, permissions: procurementPermissions },
      });
      await tx.user.create({
        data: { tenantId: tenant.tenantId, email, name: "Procurement Only Test User", passwordHash, roleId: role.id },
      });
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ organizationSlug: tenant.slug, email, password })
      .expect(200);
    const procurementAuth = { Authorization: `Bearer ${login.body.accessToken}` };

    const product = await seedProduct(tenant.tenantId, "SKU-SO-PERM-1", "SO Permission Boundary Product");
    const order = await createOrder(product.id, 10);

    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/confirm`).set(procurementAuth).expect(403);
    await request(app.getHttpServer()).post(`/sales-orders/${order.id}/allocate`).set(procurementAuth).expect(403);
  });

  it("sanity: the seeded permission set stays in sync with what the Admin role in this suite actually has", async () => {
    // Guards against helpers.ts's ALL_PERMISSIONS silently drifting out of
    // sync with the six phase 2 permission strings the routes above check.
    for (const p of ["customer:write", "sales-order:create", "sales-order:confirm", "sales-order:cancel", "sales-order:allocate", "sales-order:fulfill"]) {
      expect(ALL_PERMISSIONS).toContain(p);
    }
  });
});
