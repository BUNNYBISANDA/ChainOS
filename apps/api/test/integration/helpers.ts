import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PurchaseOrderStatus, prisma, withTenant } from "@chainos/database";
import { AppModule } from "../../src/app.module";
import { AllExceptionsFilter } from "../../src/common/errors/http-exception.filter";

export const TEST_PASSWORD = "TestPass123!";

const ALL_PERMISSIONS = [
  "catalog:write",
  "procurement:write",
  "po:create",
  "po:approve",
  "po:receive",
  "inventory:write",
  "fulfillment:write",
  "order:create",
  "order:reserve",
  "order:ready",
  "shipment:create",
  "shipment:update",
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
    await tx.shipmentEvent.deleteMany({ where: { tenantId } });
    await tx.shipment.deleteMany({ where: { tenantId } });
    await tx.customerOrderLine.deleteMany({ where: { tenantId } });
    await tx.customerOrder.deleteMany({ where: { tenantId } });
    await tx.customer.deleteMany({ where: { tenantId } });
    await tx.stockMovement.deleteMany({ where: { tenantId } });
    await tx.stockLevel.deleteMany({ where: { tenantId } });
    await tx.location.deleteMany({ where: { tenantId } });
    await tx.goodsReceiptLine.deleteMany({ where: { tenantId } });
    await tx.goodsReceipt.deleteMany({ where: { tenantId } });
    await tx.purchaseOrderLine.deleteMany({ where: { tenantId } });
    await tx.purchaseOrder.deleteMany({ where: { tenantId } });
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
