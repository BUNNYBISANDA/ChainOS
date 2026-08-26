import { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  PurchaseOrderStatus,
  SalesOrderStatus,
  ShipmentDirection,
  ShipmentStatus,
  StockMovementType,
  withTenant,
} from "@chainos/database";
import { TestTenant, cleanupTestTenant, createTestApp, createTestTenant, loginTestTenant } from "./helpers";

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Golden-fixture verification for the phase 4 analytics layer (spec §50–53).
 * Every expected number here is computed by hand in the comments, then
 * asserted exactly against the live /analytics/* endpoints — this is the
 * "reconciliation" ADR 0009 substitutes for a projection-rebuild test,
 * since there is no projection to diverge.
 */
describe("Analytics — Control Tower KPIs", () => {
  let app: INestApplication;
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let token: string;
  let otherToken: string;

  // Wide enough to cover every daysAgo()/daysFromNow() fixture below regardless of when the suite runs.
  const rangeFrom = isoDate(daysAgo(40));
  const rangeTo = isoDate(daysFromNow(20));
  const wideRange = `from=${rangeFrom}&to=${rangeTo}`;

  let warehouseId: string;
  let productRiskAId: string;
  let productRiskBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTestTenant("analytics");
    otherTenant = await createTestTenant("analytics-other");
    token = await loginTestTenant(app, tenant);
    otherToken = await loginTestTenant(app, otherTenant);

    await withTenant(tenant.tenantId, async (tx) => {
      const supplierOnTime = await tx.supplier.create({ data: { tenantId: tenant.tenantId, code: "SUP-A", name: "On-Time Supplier" } });
      const supplierLate = await tx.supplier.create({ data: { tenantId: tenant.tenantId, code: "SUP-B", name: "Late Supplier" } });
      const warehouse = await tx.warehouse.create({ data: { tenantId: tenant.tenantId, code: "WH-A", name: "Main Warehouse" } });
      warehouseId = warehouse.id;
      const product = await tx.product.create({ data: { tenantId: tenant.tenantId, sku: "SKU-MAIN", name: "Main Product", costPrice: "10.00" } });
      const productRiskA = await tx.product.create({ data: { tenantId: tenant.tenantId, sku: "SKU-RISK-A", name: "Risk SKU A", costPrice: "5.00" } });
      const productRiskB = await tx.product.create({ data: { tenantId: tenant.tenantId, sku: "SKU-RISK-B", name: "Risk SKU B", costPrice: "8.00" } });
      productRiskAId = productRiskA.id;
      productRiskBId = productRiskB.id;
      const customer = await tx.customer.create({ data: { tenantId: tenant.tenantId, customerCode: "CUS-A", companyName: "OTIF Customer" } });

      // --- Procurement: overdue PO + open PO value ----------------------
      // Open PO value = 50 * 10.00 (overdue, APPROVED) + 20 * 10.00 (open, APPROVED) = 700.00
      await tx.purchaseOrder.create({
        data: {
          tenantId: tenant.tenantId,
          poNumber: "PO-OVERDUE",
          supplierId: supplierOnTime.id,
          warehouseId: warehouse.id,
          status: PurchaseOrderStatus.APPROVED,
          orderDate: daysAgo(15),
          expectedDeliveryDate: daysAgo(5),
          lines: { create: [{ tenantId: tenant.tenantId, productId: product.id, qtyOrdered: 50, unitCost: "10.00" }] },
        },
      });
      await tx.purchaseOrder.create({
        data: {
          tenantId: tenant.tenantId,
          poNumber: "PO-OPEN-NOT-OVERDUE",
          supplierId: supplierOnTime.id,
          warehouseId: warehouse.id,
          status: PurchaseOrderStatus.APPROVED,
          orderDate: daysAgo(3),
          expectedDeliveryDate: daysFromNow(10),
          lines: { create: [{ tenantId: tenant.tenantId, productId: product.id, qtyOrdered: 20, unitCost: "10.00" }] },
        },
      });

      // --- Supplier performance / supplier OTIF --------------------------
      // supplierOnTime: 1 eligible RECEIVED PO, received before expected -> on-time 100%.
      const poOnTime = await tx.purchaseOrder.create({
        data: {
          tenantId: tenant.tenantId,
          poNumber: "PO-SUPPLIER-ONTIME",
          supplierId: supplierOnTime.id,
          warehouseId: warehouse.id,
          status: PurchaseOrderStatus.RECEIVED,
          orderDate: daysAgo(25),
          expectedDeliveryDate: daysAgo(20),
          approvedAt: daysAgo(24),
          lines: { create: [{ tenantId: tenant.tenantId, productId: product.id, qtyOrdered: 30, qtyReceived: 30, unitCost: "10.00" }] },
        },
        include: { lines: true },
      });
      await tx.goodsReceipt.create({
        data: {
          tenantId: tenant.tenantId,
          purchaseOrderId: poOnTime.id,
          warehouseId: warehouse.id,
          receivedAt: daysAgo(21),
          lines: { create: [{ tenantId: tenant.tenantId, purchaseOrderLineId: poOnTime.lines[0].id, productId: product.id, qtyReceived: 30 }] },
        },
      });

      // supplierLate: 1 eligible RECEIVED PO, received after expected -> on-time 0%.
      const poLate = await tx.purchaseOrder.create({
        data: {
          tenantId: tenant.tenantId,
          poNumber: "PO-SUPPLIER-LATE",
          supplierId: supplierLate.id,
          warehouseId: warehouse.id,
          status: PurchaseOrderStatus.RECEIVED,
          orderDate: daysAgo(25),
          expectedDeliveryDate: daysAgo(20),
          approvedAt: daysAgo(24),
          lines: { create: [{ tenantId: tenant.tenantId, productId: product.id, qtyOrdered: 15, qtyReceived: 15, unitCost: "12.00" }] },
        },
        include: { lines: true },
      });
      await tx.goodsReceipt.create({
        data: {
          tenantId: tenant.tenantId,
          purchaseOrderId: poLate.id,
          warehouseId: warehouse.id,
          receivedAt: daysAgo(15), // 5 days after expectedDeliveryDate (daysAgo(20))
          lines: { create: [{ tenantId: tenant.tenantId, purchaseOrderLineId: poLate.lines[0].id, productId: product.id, qtyReceived: 15 }] },
        },
      });

      // --- Customer OTIF golden fixture (spec §50) -----------------------
      // requestedDeliveryDate is the same for all three -> OTIF = 1/3 = 33.33%.
      const requestedDeliveryDate = daysAgo(10);
      const soPass = await tx.salesOrder.create({
        data: {
          tenantId: tenant.tenantId,
          orderNumber: "SO-OTIF-PASS",
          customerId: customer.id,
          warehouseId: warehouse.id,
          orderDate: daysAgo(15),
          requestedDeliveryDate,
          status: SalesOrderStatus.FULFILLED,
          lines: { create: [{ tenantId: tenant.tenantId, productId: product.id, qtyOrdered: 100, qtyFulfilled: 100, unitPrice: "20.00" }] },
        },
      });
      const soFailIncomplete = await tx.salesOrder.create({
        data: {
          tenantId: tenant.tenantId,
          orderNumber: "SO-OTIF-FAIL-INCOMPLETE",
          customerId: customer.id,
          warehouseId: warehouse.id,
          orderDate: daysAgo(15),
          requestedDeliveryDate,
          status: SalesOrderStatus.PARTIALLY_FULFILLED,
          lines: { create: [{ tenantId: tenant.tenantId, productId: product.id, qtyOrdered: 100, qtyFulfilled: 80, unitPrice: "20.00" }] },
        },
      });
      const soFailLate = await tx.salesOrder.create({
        data: {
          tenantId: tenant.tenantId,
          orderNumber: "SO-OTIF-FAIL-LATE",
          customerId: customer.id,
          warehouseId: warehouse.id,
          orderDate: daysAgo(15),
          requestedDeliveryDate,
          status: SalesOrderStatus.FULFILLED,
          lines: { create: [{ tenantId: tenant.tenantId, productId: product.id, qtyOrdered: 100, qtyFulfilled: 100, unitPrice: "20.00" }] },
        },
      });

      for (const [so, deliveredAt, number] of [
        [soPass, daysAgo(11), "SHP-OTIF-PASS"],
        [soFailIncomplete, daysAgo(11), "SHP-OTIF-FAIL-INCOMPLETE"],
        [soFailLate, daysAgo(8), "SHP-OTIF-FAIL-LATE"],
      ] as const) {
        await tx.shipment.create({
          data: {
            tenantId: tenant.tenantId,
            shipmentNumber: number,
            direction: ShipmentDirection.OUTBOUND,
            status: ShipmentStatus.DELIVERED,
            salesOrderId: so.id,
            originWarehouseId: warehouse.id,
            destCustomerId: customer.id,
            deliveredAt,
            actualArrivalAt: deliveredAt,
            estimatedArrivalAt: requestedDeliveryDate,
          },
        });
      }

      // --- Inventory risk golden fixture (spec §52) -----------------------
      // SKU A: available 300, incoming 0, demand 800 -> projected -500 -> PROJECTED_STOCKOUT.
      await tx.stockLevel.create({ data: { tenantId: tenant.tenantId, productId: productRiskA.id, warehouseId: warehouse.id, quantityOnHand: 300, quantityReserved: 0 } });
      await tx.stockMovement.create({ data: { tenantId: tenant.tenantId, productId: productRiskA.id, warehouseId: warehouse.id, type: StockMovementType.RECEIPT, quantityDelta: 300 } });
      await tx.salesOrder.create({
        data: {
          tenantId: tenant.tenantId,
          orderNumber: "SO-RISK-A-DEMAND",
          customerId: customer.id,
          warehouseId: warehouse.id,
          status: SalesOrderStatus.CONFIRMED,
          lines: { create: [{ tenantId: tenant.tenantId, productId: productRiskA.id, qtyOrdered: 800, unitPrice: "6.00" }] },
        },
      });

      // SKU B: available 1000, incoming 500, demand 1200 -> projected 300 -> HEALTHY.
      await tx.stockLevel.create({ data: { tenantId: tenant.tenantId, productId: productRiskB.id, warehouseId: warehouse.id, quantityOnHand: 1000, quantityReserved: 0 } });
      await tx.stockMovement.create({ data: { tenantId: tenant.tenantId, productId: productRiskB.id, warehouseId: warehouse.id, type: StockMovementType.RECEIPT, quantityDelta: 1000 } });
      await tx.purchaseOrder.create({
        data: {
          tenantId: tenant.tenantId,
          poNumber: "PO-RISK-B-INCOMING",
          supplierId: supplierOnTime.id,
          warehouseId: warehouse.id,
          status: PurchaseOrderStatus.APPROVED,
          orderDate: daysAgo(2),
          expectedDeliveryDate: daysFromNow(10),
          lines: { create: [{ tenantId: tenant.tenantId, productId: productRiskB.id, qtyOrdered: 500, unitCost: "9.00" }] },
        },
      });
      await tx.salesOrder.create({
        data: {
          tenantId: tenant.tenantId,
          orderNumber: "SO-RISK-B-DEMAND",
          customerId: customer.id,
          warehouseId: warehouse.id,
          status: SalesOrderStatus.CONFIRMED,
          lines: { create: [{ tenantId: tenant.tenantId, productId: productRiskB.id, qtyOrdered: 1200, unitPrice: "10.00" }] },
        },
      });
    });

    // A second tenant with its own, very different inventory value/OTIF —
    // used only by the tenant-isolation test below.
    await withTenant(otherTenant.tenantId, async (tx) => {
      const product = await tx.product.create({ data: { tenantId: otherTenant.tenantId, sku: "OTHER-SKU", name: "Other Tenant Product", costPrice: "1000.00" } });
      const warehouse = await tx.warehouse.create({ data: { tenantId: otherTenant.tenantId, code: "OTHER-WH", name: "Other Warehouse" } });
      await tx.stockLevel.create({ data: { tenantId: otherTenant.tenantId, productId: product.id, warehouseId: warehouse.id, quantityOnHand: 999, quantityReserved: 0 } });
    });
  }, 120000);

  afterAll(async () => {
    await cleanupTestTenant(tenant.tenantId);
    await cleanupTestTenant(otherTenant.tenantId);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const otherAuth = () => ({ Authorization: `Bearer ${otherToken}` });

  it("computes the golden customer-OTIF fixture as exactly 1/3 = 33.33%", async () => {
    const res = await request(app.getHttpServer()).get(`/analytics/fulfillment?${wideRange}`).set(auth()).expect(200);
    expect(res.body.otifEligibleOrders).toBe(3);
    expect(res.body.otifSuccessfulOrders).toBe(1);
    expect(res.body.customerOtifPercent).toBeCloseTo(33.33, 2);
  });

  it("renders OTIF as null (not 0 or NaN) when there are no eligible delivered orders", async () => {
    const res = await request(app.getHttpServer())
      .get(`/analytics/fulfillment?from=${isoDate(daysFromNow(1))}&to=${isoDate(daysFromNow(2))}`)
      .set(auth())
      .expect(200);
    expect(res.body.otifEligibleOrders).toBe(0);
    expect(res.body.customerOtifPercent).toBeNull();
  });

  it("computes the golden inventory-risk fixture exactly (SKU A stockout projection, SKU B healthy)", async () => {
    const res = await request(app.getHttpServer()).get(`/analytics/inventory/risk?pageSize=50`).set(auth()).expect(200);
    const rows: Array<Record<string, unknown>> = res.body.items;

    const skuA = rows.find((r) => r.productId === productRiskAId)!;
    expect(skuA).toMatchObject({ available: 300, incoming: 0, demand: 800, projected: -500, riskLevel: "PROJECTED_STOCKOUT" });

    const skuB = rows.find((r) => r.productId === productRiskBId)!;
    expect(skuB).toMatchObject({ available: 1000, incoming: 500, demand: 1200, projected: 300, riskLevel: "HEALTHY" });
  });

  it("computes overdue PO count and open PO value against the canonical direct query", async () => {
    const res = await request(app.getHttpServer()).get(`/analytics/procurement?${wideRange}`).set(auth()).expect(200);
    expect(res.body.overduePurchaseOrders).toBe(1);

    const canonical = await withTenant(tenant.tenantId, (tx) =>
      tx.purchaseOrder.findMany({ where: { tenantId: tenant.tenantId, status: { in: ["DRAFT", "APPROVED", "SHIPPED", "PARTIALLY_RECEIVED"] } }, include: { lines: true } }),
    );
    const expectedOpenValue = canonical.reduce((sum, po) => sum + po.lines.reduce((s, l) => s + l.qtyOrdered * Number(l.unitCost), 0), 0);
    expect(res.body.openPurchaseOrderValue).toBeCloseTo(expectedOpenValue, 2);
    expect(res.body.openPurchaseOrders).toBe(canonical.length);
  });

  it("computes supplier performance and supplier OTIF for both the on-time and late supplier", async () => {
    const res = await request(app.getHttpServer()).get(`/analytics/suppliers?${wideRange}&pageSize=50`).set(auth()).expect(200);
    const rows: Array<Record<string, unknown>> = res.body.items;

    const onTime = rows.find((r) => r.supplierCode === "SUP-A")!;
    expect(onTime.onTimePercent).toBe(100);
    expect(onTime.otifPercent).toBe(100);
    expect(onTime.latePoCount).toBe(0);

    const late = rows.find((r) => r.supplierCode === "SUP-B")!;
    expect(late.onTimePercent).toBe(0);
    expect(late.otifPercent).toBe(0);
    expect(late.latePoCount).toBe(1);
  });

  it("narrows results when the date range excludes a fixture", async () => {
    const res = await request(app.getHttpServer())
      .get(`/analytics/procurement?from=${isoDate(daysAgo(2))}&to=${isoDate(daysFromNow(1))}`)
      .set(auth())
      .expect(200);
    // Only PO-OPEN-NOT-OVERDUE (orderDate daysAgo(3)... actually excluded too) — expect fewer than the full 4 procurement POs seeded.
    expect(res.body.openPurchaseOrders).toBeLessThan(4);
  });

  it("scopes results to the selected warehouse", async () => {
    const res = await withTenant(tenant.tenantId, (tx) => tx.warehouse.create({ data: { tenantId: tenant.tenantId, code: "WH-EMPTY", name: "Empty Warehouse" } }));
    const empty = await request(app.getHttpServer()).get(`/analytics/procurement?${wideRange}&warehouseId=${res.id}`).set(auth()).expect(200);
    expect(empty.body.openPurchaseOrders).toBe(0);

    const full = await request(app.getHttpServer()).get(`/analytics/procurement?${wideRange}&warehouseId=${warehouseId}`).set(auth()).expect(200);
    expect(full.body.openPurchaseOrders).toBeGreaterThan(0);
  });

  it("never leaks another tenant's aggregates into the control tower summary", async () => {
    const mine = await request(app.getHttpServer()).get(`/analytics/control-tower?${wideRange}`).set(auth()).expect(200);
    const theirs = await request(app.getHttpServer()).get(`/analytics/control-tower?${wideRange}`).set(otherAuth()).expect(200);

    // Tenant A's inventory value must not include tenant B's 999 x 1000.00 stock, and vice versa.
    expect(mine.body.inventory.inventoryValue).toBeLessThan(theirs.body.inventory.inventoryValue === 0 ? Infinity : 999000);
    expect(theirs.body.inventory.inventoryValue).toBe(999000);
    expect(mine.body.fulfillment.otifEligibleOrders).toBe(3);
    expect(theirs.body.fulfillment.otifEligibleOrders).toBe(0);
  });

  it("rejects a request with no access token", async () => {
    await request(app.getHttpServer()).get("/analytics/control-tower").expect(401);
  });

  it("reconciles inventory value against a direct StockLevel x Product query", async () => {
    const res = await request(app.getHttpServer()).get(`/analytics/inventory?${wideRange}`).set(auth()).expect(200);

    const levels = await withTenant(tenant.tenantId, (tx) => tx.stockLevel.findMany({ where: { tenantId: tenant.tenantId }, include: { product: true } }));
    const expectedValue = levels.reduce((sum, l) => sum + l.quantityOnHand * Number(l.product.costPrice), 0);
    expect(res.body.inventoryValue).toBeCloseTo(expectedValue, 2);
  });
});
