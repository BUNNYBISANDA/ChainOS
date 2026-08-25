import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { StockMovementType, withTenant } from "@chainos/database";
import {
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
 * Mandatory concurrency-safety test (phase 2 task spec §5): two sales
 * orders concurrently allocating against the same product+warehouse, where
 * only one request's worth of stock actually exists. Structured like
 * inventory-idempotency.integration-spec.ts's concurrent-call tests
 * (`Promise.all` against a real Postgres transaction), but exercising
 * `InventoryService.reserveForSalesOrder`'s `SELECT ... FOR UPDATE` lock
 * (see docs/adr/0006-reservation-concurrency-strategy.md) instead of the
 * idempotency claim.
 */
describe("Concurrent sales order allocation against real Postgres", () => {
  let app: INestApplication;
  let tenant: TestTenant;
  let token: string;
  let warehouseId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTestTenant("reserve-concurrency");
    token = await loginTestTenant(app, tenant);

    const warehouse = await seedWarehouse(tenant.tenantId, "Reservation Concurrency Warehouse");
    const customer = await seedCustomer(tenant.tenantId, "Reservation Concurrency Customer");
    warehouseId = warehouse.id;
    customerId = customer.id;
  }, 90000);

  afterAll(async () => {
    await cleanupTestTenant(tenant.tenantId);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

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

  async function createConfirmedOrder(productId: string, qty: number) {
    const create = await request(app.getHttpServer())
      .post("/sales-orders")
      .set(auth())
      .send({ customerId, warehouseId, lines: [{ productId, qtyOrdered: qty, unitPrice: 10 }] })
      .expect(201);
    await request(app.getHttpServer()).post(`/sales-orders/${create.body.id}/confirm`).set(auth()).expect(201);
    return create.body as { id: string };
  }

  it("available = 100, two orders requesting 80 each allocated concurrently: exactly one succeeds, reserved never exceeds 100", async () => {
    const product = await seedProduct(tenant.tenantId, "SKU-RESERVE-CONCURRENCY-1", "Reservation Concurrency Product");
    await seedStock(product.id, 100);

    const [orderA, orderB] = await Promise.all([createConfirmedOrder(product.id, 80), createConfirmedOrder(product.id, 80)]);

    const [resultA, resultB] = await Promise.all([
      request(app.getHttpServer()).post(`/sales-orders/${orderA.id}/allocate`).set(auth()),
      request(app.getHttpServer()).post(`/sales-orders/${orderB.id}/allocate`).set(auth()),
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toEqual([201, 400]); // exactly one succeeds, one fails

    const failed = resultA.status === 400 ? resultA : resultB;
    expect(failed.body.code).toBe("INVENTORY_INSUFFICIENT_AVAILABLE_STOCK");

    const recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.reserved).toBeLessThanOrEqual(100);
    expect(recon.reserved).toBe(80); // exactly the winner's reservation, never both

    const reservationCount = await withTenant(tenant.tenantId, (tx) =>
      tx.inventoryReservation.count({ where: { productId: product.id, warehouseId } }),
    );
    expect(reservationCount).toBe(1); // the losing allocate() rolled back its whole transaction, not just the check
  });

  it("available = 100, three orders requesting 40 each allocated concurrently: exactly two succeed, reserved never exceeds 100", async () => {
    const product = await seedProduct(tenant.tenantId, "SKU-RESERVE-CONCURRENCY-2", "Reservation Concurrency Product 2");
    await seedStock(product.id, 100);

    const orders = await Promise.all([
      createConfirmedOrder(product.id, 40),
      createConfirmedOrder(product.id, 40),
      createConfirmedOrder(product.id, 40),
    ]);

    const results = await Promise.all(
      orders.map((o) => request(app.getHttpServer()).post(`/sales-orders/${o.id}/allocate`).set(auth())),
    );

    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status === 400);
    expect(succeeded).toHaveLength(2); // 40 + 40 = 80 <= 100 < 120
    expect(failed).toHaveLength(1);
    expect(failed[0].body.code).toBe("INVENTORY_INSUFFICIENT_AVAILABLE_STOCK");

    const recon = await getStockReconciliation(tenant.tenantId, product.id, warehouseId);
    expect(recon.reserved).toBeLessThanOrEqual(100);
    expect(recon.reserved).toBe(80);
  });
});
