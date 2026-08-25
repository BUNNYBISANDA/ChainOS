import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PurchaseOrderStatus, SalesOrderStatus, prisma, withTenant } from "@chainos/database";
import { AppModule } from "../../src/app.module";
import { AllExceptionsFilter } from "../../src/common/errors/http-exception.filter";

export const TEST_PASSWORD = "TestPass123!";

export const ALL_PERMISSIONS = [
  "catalog:write",
  "procurement:write",
  "po:create",
  "po:approve",
  "po:receive",
  "inventory:write",
  "customer:write",
  "sales-order:create",
  "sales-order:confirm",
  "sales-order:cancel",
  "sales-order:allocate",
  "sales-order:fulfill",
  "shipment:create",
  "shipment:update",
  "shipment:tracking:create",
  "shipment:eta:update",
  "shipment:exceptions:read",
];

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

export interface TestTenant {
  tenantId: string;
  slug: string;
  userId: string;
  email: string;
}

/** Creates a tenant + one Admin user (all permissions), for test isolation from other test files. */
export async function createTestTenant(label: string): Promise<TestTenant> {
  const slug = `test-${label}-${randomUUID().slice(0, 8)}`;
  const tenant = await prisma.tenant.create({ data: { slug, name: `Test Tenant ${label}` } });
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const email = `admin@${slug}.test`;

  const userId = await withTenant(tenant.id, async (tx) => {
    const role = await tx.role.create({ data: { tenantId: tenant.id, name: "Admin", permissions: ALL_PERMISSIONS } });
    const user = await tx.user.create({
      data: { tenantId: tenant.id, email, name: "Test Admin", passwordHash, roleId: role.id },
    });
    return user.id;
  });

  return { tenantId: tenant.id, slug, userId, email };
}

export async function loginTestTenant(app: INestApplication, tenant: TestTenant): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ organizationSlug: tenant.slug, email: tenant.email, password: TEST_PASSWORD })
    .expect(200);
  return res.body.accessToken as string;
}

export function seedSupplier(tenantId: string, name: string) {
  const code = `SUP-${randomUUID().slice(0, 8)}`;
  return withTenant(tenantId, (tx) => tx.supplier.create({ data: { tenantId, code, name } }));
}

export function seedWarehouse(tenantId: string, name: string) {
  const code = `WH-${randomUUID().slice(0, 8)}`;
  return withTenant(tenantId, (tx) => tx.warehouse.create({ data: { tenantId, code, name } }));
}

export function seedProduct(tenantId: string, sku: string, name: string) {
  return withTenant(tenantId, (tx) => tx.product.create({ data: { tenantId, sku, name } }));
}

/** Defaults to SHIPPED — the status most tests need to immediately exercise receiving. */
export function seedPurchaseOrder(
  tenantId: string,
  supplierId: string,
  warehouseId: string,
  productId: string,
  qty: number,
  status: PurchaseOrderStatus = PurchaseOrderStatus.SHIPPED,
) {
  const poNumber = `PO-TEST-${randomUUID().slice(0, 8)}`;
  return withTenant(tenantId, (tx) =>
    tx.purchaseOrder.create({
      data: {
        tenantId,
        poNumber,
        supplierId,
        warehouseId,
        status,
        lines: { create: [{ tenantId, productId, qtyOrdered: qty, unitCost: "10.00" }] },
      },
      include: { lines: true },
    }),
  );
}

export function seedCustomer(tenantId: string, companyName: string) {
  const customerCode = `CUS-${randomUUID().slice(0, 8)}`;
  return withTenant(tenantId, (tx) => tx.customer.create({ data: { tenantId, customerCode, companyName } }));
}

/** Defaults to DRAFT — tests that need ALLOCATED/PARTIALLY_FULFILLED drive it there through the real confirm/allocate/fulfill endpoints so InventoryReservation/StockLevel side effects stay correct, rather than faking that state directly. */
export function seedSalesOrder(
  tenantId: string,
  customerId: string,
  warehouseId: string,
  productId: string,
  qty: number,
  unitPrice = "20.00",
  status: SalesOrderStatus = SalesOrderStatus.DRAFT,
) {
  const orderNumber = `SO-TEST-${randomUUID().slice(0, 8)}`;
  return withTenant(tenantId, (tx) =>
    tx.salesOrder.create({
      data: {
        tenantId,
        orderNumber,
        customerId,
        warehouseId,
        status,
        lines: { create: [{ tenantId, productId, qtyOrdered: qty, unitPrice }] },
      },
      include: { lines: true },
    }),
  );
}

/**
 * The invariant every phase 2 test scenario must hold (spec §19):
 * StockLevel.quantityOnHand must equal the sum of every physical
 * StockMovement quantityDelta for that product+warehouse (reservation
 * never creates a movement, so this holds through allocate/cancel too,
 * not just through fulfillment), and available is always onHand -
 * reserved by construction. Returns raw numbers — call sites assert with
 * their own `expect(...)`, same convention as `stockOnHand()` in
 * purchase-order-lifecycle.integration-spec.ts.
 */
export async function getStockReconciliation(tenantId: string, productId: string, warehouseId: string) {
  return withTenant(tenantId, async (tx) => {
    const level = await tx.stockLevel.findFirst({ where: { productId, warehouseId, locationId: null } });
    const movements = await tx.stockMovement.findMany({ where: { productId, warehouseId } });
    const movementSum = movements.reduce((sum, m) => sum + m.quantityDelta, 0);
    const onHand = level?.quantityOnHand ?? 0;
    const reserved = level?.quantityReserved ?? 0;
    return { onHand, reserved, available: onHand - reserved, movementSum };
  });
}

/**
 * True only if the connected DB role is actually subject to RLS (not a
 * superuser and not BYPASSRLS — both silently no-op every policy). Tests
 * that rely on RLS alone (no explicit tenantId filter in the query) use
 * this to fail loudly with a clear cause instead of a confusing false
 * negative when run against a misconfigured connection — see
 * docs/architecture/rls.md. This must be true in CI and production.
 */
export async function isRlsEnforced(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
  );
  const role = rows[0];
  if (!role) return true;
  return !role.rolsuper && !role.rolbypassrls;
}

/** Deletes every row for one test tenant, in FK-safe order, then the tenant itself. */
export async function cleanupTestTenant(tenantId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.shipmentException.deleteMany({ where: { tenantId } });
    await tx.shipmentEvent.deleteMany({ where: { tenantId } });
    await tx.shipment.deleteMany({ where: { tenantId } });
    await tx.inventoryReservation.deleteMany({ where: { tenantId } });
    await tx.stockMovement.deleteMany({ where: { tenantId } });
    await tx.stockLevel.deleteMany({ where: { tenantId } });
    await tx.location.deleteMany({ where: { tenantId } });
    await tx.goodsReceiptLine.deleteMany({ where: { tenantId } });
    await tx.goodsReceipt.deleteMany({ where: { tenantId } });
    await tx.purchaseOrderLine.deleteMany({ where: { tenantId } });
    await tx.purchaseOrder.deleteMany({ where: { tenantId } });
    await tx.salesOrderLine.deleteMany({ where: { tenantId } });
    await tx.salesOrder.deleteMany({ where: { tenantId } });
    await tx.customer.deleteMany({ where: { tenantId } });
    await tx.supplierProduct.deleteMany({ where: { tenantId } });
    await tx.supplier.deleteMany({ where: { tenantId } });
    await tx.product.deleteMany({ where: { tenantId } });
    await tx.warehouse.deleteMany({ where: { tenantId } });
    await tx.refreshToken.deleteMany({ where: { tenantId } });
    await tx.processedEvent.deleteMany({ where: { tenantId } });
    await tx.numberSequence.deleteMany({ where: { tenantId } });
    await tx.auditLog.deleteMany({ where: { tenantId } });
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.role.deleteMany({ where: { tenantId } });
  });
  await prisma.tenant.delete({ where: { id: tenantId } });
}
