import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as bcrypt from "bcryptjs";
import { withTenant } from "@chainos/database";
import {
  TestTenant,
  cleanupTestTenant,
  createTestApp,
  createTestTenant,
  loginTestTenant,
  seedProduct,
  seedSupplier,
  seedWarehouse,
} from "./helpers";

/**
 * End-to-end over real Postgres: the whole inbound slice, driven through
 * the HTTP API exactly as the frontend would call it. Covers the phase 1
 * DoD test list — PO state machine, over-receipt, partial/complete
 * receiving with real stock checks, and the po:approve permission split.
 */
describe("Purchase order lifecycle (create -> approve -> ship -> receive)", () => {
  let app: INestApplication;
  let tenant: TestTenant;
  let token: string;
  let supplierId: string;
  let warehouseId: string;
  let productId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTestTenant("po-lifecycle");
    token = await loginTestTenant(app, tenant);

    const supplier = await seedSupplier(tenant.tenantId, "Lifecycle Test Supplier");
    const warehouse = await seedWarehouse(tenant.tenantId, "Lifecycle Test Warehouse");
    const product = await seedProduct(tenant.tenantId, "SKU-LIFECYCLE-1", "Lifecycle Test Product");
    supplierId = supplier.id;
    warehouseId = warehouse.id;
    productId = product.id;
  }, 90000);

  afterAll(async () => {
    await cleanupTestTenant(tenant.tenantId);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function stockOnHand(): Promise<number> {
    const level = await withTenant(tenant.tenantId, (tx) =>
      tx.stockLevel.findFirst({ where: { productId, warehouseId, locationId: null } }),
    );
    return level?.quantityOnHand ?? 0;
  }

  it("rejects DRAFT -> RECEIVED directly (must go through APPROVED -> SHIPPED first)", async () => {
    const create = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set(auth())
      .send({ supplierId, warehouseId, lines: [{ productId, qtyOrdered: 10, unitCost: 5 }] })
      .expect(201);

    const lineId = create.body.lines[0].id;
    const res = await request(app.getHttpServer())
      .post(`/purchase-orders/${create.body.id}/receive`)
      .set(auth())
      .send({ lines: [{ purchaseOrderLineId: lineId, qtyReceived: 10 }] })
      .expect(400);
    expect(res.body.code).toBe("PURCHASE_ORDER_INVALID_STATUS");

    await request(app.getHttpServer()).post(`/purchase-orders/${create.body.id}/cancel`).set(auth()).expect(201);
  });

  it("full happy path: create -> approve -> ship -> partially receive -> fully receive, PO number is human-readable", async () => {
    const create = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set(auth())
      .send({
        supplierId,
        warehouseId,
        currency: "THB",
        lines: [{ productId, qtyOrdered: 1000, unitCost: 85 }],
      })
      .expect(201);

    expect(create.body.poNumber).toMatch(/^PO-\d{4}-\d{6}$/);
    expect(create.body.status).toBe("DRAFT");
    const poId = create.body.id;
    const lineId = create.body.lines[0].id;

    const approved = await request(app.getHttpServer()).post(`/purchase-orders/${poId}/approve`).set(auth()).expect(201);
    expect(approved.body.status).toBe("APPROVED");
    expect(approved.body.approvedByUserId).toBe(tenant.userId);
    expect(approved.body.approvedAt).toBeTruthy();

    const shipment = await request(app.getHttpServer())
      .post("/shipments")
      .set(auth())
      .send({ direction: "INBOUND", purchaseOrderId: poId })
      .expect(201);
    expect(shipment.body.shipmentNumber).toMatch(/^SHP-\d{4}-\d{6}$/);
    expect(shipment.body.destWarehouseId).toBe(warehouseId);

    // PO should have flipped to SHIPPED via the shipment.created event —
    // give the async handler a moment then poll the PO.
    await new Promise((r) => setTimeout(r, 200));
    const afterShipment = await request(app.getHttpServer()).get(`/purchase-orders/${poId}`).set(auth()).expect(200);
    expect(afterShipment.body.status).toBe("SHIPPED");

    await request(app.getHttpServer()).post(`/shipments/${shipment.body.id}/book`).set(auth()).expect(201);
    await request(app.getHttpServer()).post(`/shipments/${shipment.body.id}/dispatch`).set(auth()).expect(201);
    const arrived = await request(app.getHttpServer()).post(`/shipments/${shipment.body.id}/arrive`).set(auth()).expect(201);
    expect(arrived.body.status).toBe("ARRIVED");

    // First receipt: 600 of 1000.
    const firstReceive = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/receive`)
      .set(auth())
      .send({ lines: [{ purchaseOrderLineId: lineId, qtyReceived: 600 }] })
      .expect(201);
    expect(firstReceive.body.status).toBe("PARTIALLY_RECEIVED");
    expect(firstReceive.body.lines[0].qtyReceived).toBe(600);
    expect(firstReceive.body.lines[0].remaining).toBe(400);
    expect(await stockOnHand()).toBe(600);

    // Second receipt: remaining 400.
    const secondReceive = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/receive`)
      .set(auth())
      .send({ lines: [{ purchaseOrderLineId: lineId, qtyReceived: 400 }] })
      .expect(201);
    expect(secondReceive.body.status).toBe("RECEIVED");
    expect(secondReceive.body.lines[0].remaining).toBe(0);
    expect(await stockOnHand()).toBe(1000);

    await request(app.getHttpServer()).post(`/shipments/${shipment.body.id}/deliver`).set(auth()).expect(201);

    // The ledger has exactly two immutable RECEIPT movements for this product/warehouse.
    const ledger = await request(app.getHttpServer())
      .get(`/stock-movements?productId=${productId}&warehouseId=${warehouseId}`)
      .set(auth())
      .expect(200);
    expect(ledger.body).toHaveLength(2);
    expect(ledger.body.every((m: { quantityDelta: number }) => m.quantityDelta === 600 || m.quantityDelta === 400)).toBe(true);
  });

  it("rejects over-receipt without clamping (1000 ordered, try to receive 1001)", async () => {
    const create = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set(auth())
      .send({ supplierId, warehouseId, lines: [{ productId, qtyOrdered: 1000, unitCost: 85 }] })
      .expect(201);
    const poId = create.body.id;
    const lineId = create.body.lines[0].id;

    await request(app.getHttpServer()).post(`/purchase-orders/${poId}/approve`).set(auth()).expect(201);
    await request(app.getHttpServer())
      .post("/shipments")
      .set(auth())
      .send({ direction: "INBOUND", purchaseOrderId: poId })
      .expect(201);
    await new Promise((r) => setTimeout(r, 200));

    const res = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/receive`)
      .set(auth())
      .send({ lines: [{ purchaseOrderLineId: lineId, qtyReceived: 1001 }] })
      .expect(400);
    expect(res.body.code).toBe("PURCHASE_ORDER_OVER_RECEIPT");

    // The rejected attempt must not have partially applied anything.
    const po = await request(app.getHttpServer()).get(`/purchase-orders/${poId}`).set(auth()).expect(200);
    expect(po.body.status).toBe("SHIPPED");
    expect(po.body.lines[0].qtyReceived).toBe(0);
  });

  it("a Warehouse Manager (no po:approve) cannot approve a PO", async () => {
    const warehouseUserEmail = `warehouse-user-${Date.now()}@${tenant.slug}.test`;
    const warehouseUserPassword = "WarehouseTest123!";
    const passwordHash = await bcrypt.hash(warehouseUserPassword, 10);

    await withTenant(tenant.tenantId, async (tx) => {
      const role = await tx.role.create({
        data: { tenantId: tenant.tenantId, name: `Warehouse ${Date.now()}`, permissions: ["po:receive", "inventory:write"] },
      });
      await tx.user.create({
        data: { tenantId: tenant.tenantId, email: warehouseUserEmail, name: "Warehouse Test User", passwordHash, roleId: role.id },
      });
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ organizationSlug: tenant.slug, email: warehouseUserEmail, password: warehouseUserPassword })
      .expect(200);

    const create = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set(auth())
      .send({ supplierId, warehouseId, lines: [{ productId, qtyOrdered: 5, unitCost: 5 }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/purchase-orders/${create.body.id}/approve`)
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .expect(403);
  });
});
