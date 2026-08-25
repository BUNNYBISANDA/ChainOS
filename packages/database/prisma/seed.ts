/**
 * Deterministic development seed: one realistic Thailand-based tenant
 * ("Siam Distribution Co., Ltd.") with three users, one supplier, one
 * product, one warehouse, and a single DRAFT purchase order — the phase 1
 * inbound demo scenario (see docs/adr/0004-purchase-order-lifecycle.md).
 * The PO is deliberately left at DRAFT: approve -> ship -> receive is
 * meant to be walked through live from the UI, not pre-baked into seed
 * data. Every row is upserted by a fixed id/natural key, so `pnpm
 * db:seed` is safe to re-run — it converges to the same state instead of
 * duplicating rows. For a clean slate use `pnpm --filter @chainos/database
 * reset` (drops + re-migrates + reseeds).
 *
 * Writes go through `withTenant()`, same as application code — the seed
 * client is not assumed to bypass RLS (see docs/architecture/rls.md).
 * Only the Tenant row itself is written outside a tenant transaction,
 * since `tenants` isn't itself tenant-scoped.
 *
 * Every seeded user shares the password below — dev/test only, never a
 * pattern to carry into a real environment.
 */
import * as bcrypt from "bcryptjs";
import { PurchaseOrderStatus, prisma, withTenant } from "../src/index";

export const SEED_DEV_PASSWORD = "ChainOS123!";

const ids = {
  tenant: "00000000-0000-4000-8000-000000000001",
  roleAdmin: "00000000-0000-4000-8000-000000000010",
  roleProcurement: "00000000-0000-4000-8000-000000000011",
  roleWarehouse: "00000000-0000-4000-8000-000000000012",
  userAdmin: "00000000-0000-4000-8000-000000000020",
  userProcurement: "00000000-0000-4000-8000-000000000021",
  userWarehouse: "00000000-0000-4000-8000-000000000022",
  supplier: "00000000-0000-4000-8000-000000000030",
  warehouse: "00000000-0000-4000-8000-000000000040",
  product: "00000000-0000-4000-8000-000000000050",
  purchaseOrder: "00000000-0000-4000-8000-000000000060",
  purchaseOrderLine: "00000000-0000-4000-8000-000000000061",
} as const;

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

// Regular warehouse users must NOT be able to approve a PO (task spec) —
// only Admin and Procurement Manager carry "po:approve".
const PROCUREMENT_PERMISSIONS = ["procurement:write", "po:create", "po:approve", "po:receive", "catalog:write"];

const WAREHOUSE_PERMISSIONS = [
  "inventory:write",
  "po:receive",
  "order:reserve",
  "order:ready",
  "shipment:create",
  "shipment:update",
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "siam-distribution" },
    update: { name: "Siam Distribution Co., Ltd." },
    create: { id: ids.tenant, slug: "siam-distribution", name: "Siam Distribution Co., Ltd." },
  });

  const passwordHash = await bcrypt.hash(SEED_DEV_PASSWORD, 10);

  const { supplier, warehouse, product, purchaseOrder } = await withTenant(tenant.id, async (tx) => {
    // Sequential, not Promise.all: an interactive transaction is bound to
    // one connection, and concurrent queries against the same `tx` are
    // unsupported by Prisma.
    const roleAdmin = await tx.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Admin" } },
      update: { permissions: ALL_PERMISSIONS },
      create: { id: ids.roleAdmin, tenantId: tenant.id, name: "Admin", permissions: ALL_PERMISSIONS },
    });
    const roleProcurement = await tx.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Procurement Manager" } },
      update: { permissions: PROCUREMENT_PERMISSIONS },
      create: {
        id: ids.roleProcurement,
        tenantId: tenant.id,
        name: "Procurement Manager",
        permissions: PROCUREMENT_PERMISSIONS,
      },
    });
    const roleWarehouse = await tx.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Warehouse Manager" } },
      update: { permissions: WAREHOUSE_PERMISSIONS },
      create: {
        id: ids.roleWarehouse,
        tenantId: tenant.id,
        name: "Warehouse Manager",
        permissions: WAREHOUSE_PERMISSIONS,
      },
    });

    await tx.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: "admin@siamdistribution.co.th" } },
      update: { passwordHash, roleId: roleAdmin.id },
      create: {
        id: ids.userAdmin,
        tenantId: tenant.id,
        email: "admin@siamdistribution.co.th",
        name: "Somchai Vorakit",
        passwordHash,
        roleId: roleAdmin.id,
      },
    });
    await tx.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: "procurement@siamdistribution.co.th" } },
      update: { passwordHash, roleId: roleProcurement.id },
      create: {
        id: ids.userProcurement,
        tenantId: tenant.id,
        email: "procurement@siamdistribution.co.th",
        name: "Pranee Suksawat",
        passwordHash,
        roleId: roleProcurement.id,
      },
    });
    await tx.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: "warehouse@siamdistribution.co.th" } },
      update: { passwordHash, roleId: roleWarehouse.id },
      create: {
        id: ids.userWarehouse,
        tenantId: tenant.id,
        email: "warehouse@siamdistribution.co.th",
        name: "Anucha Thongdee",
        passwordHash,
        roleId: roleWarehouse.id,
      },
    });

    const supplier = await tx.supplier.upsert({
      where: { id: ids.supplier },
      update: { tenantId: tenant.id, code: "SUP-001", name: "Shenzhen Components Ltd." },
      create: {
        id: ids.supplier,
        tenantId: tenant.id,
        code: "SUP-001",
        name: "Shenzhen Components Ltd.",
        country: "China",
        contactName: "Li Wei",
        email: "sales@shenzhencomponents.example.cn",
        phone: "+86-755-555-0198",
      },
    });

    const warehouse = await tx.warehouse.upsert({
      where: { id: ids.warehouse },
      update: { tenantId: tenant.id, code: "BKK-DC-01", name: "Bangkok Distribution Center" },
      create: {
        id: ids.warehouse,
        tenantId: tenant.id,
        code: "BKK-DC-01",
        name: "Bangkok Distribution Center",
        address: "123 Bang Na-Trat Road, Bang Na",
        province: "Bangkok",
        country: "Thailand",
      },
    });

    const product = await tx.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: "ELEC-001" } },
      update: { name: "USB-C Adapter", category: "Electronics", costPrice: "85.00" },
      create: {
        id: ids.product,
        tenantId: tenant.id,
        sku: "ELEC-001",
        name: "USB-C Adapter",
        description: "65W USB-C power adapter, universal input",
        category: "Electronics",
        uom: "EACH",
        costPrice: "85.00",
      },
    });

    await tx.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId: supplier.id, productId: product.id } },
      update: { unitCost: "85.00", leadTimeDays: 21 },
      create: {
        tenantId: tenant.id,
        supplierId: supplier.id,
        productId: product.id,
        supplierSku: "SC-USBC-65W",
        unitCost: "85.00",
        leadTimeDays: 21,
      },
    });

    // Keep the PO-2026 sequence consistent with this hardcoded PO number,
    // so the next PO created through the app is PO-2026-000002, not a
    // colliding PO-2026-000001.
    await tx.numberSequence.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "PO-2026" } },
      update: { value: 1 },
      create: { tenantId: tenant.id, key: "PO-2026", value: 1 },
    });

    const purchaseOrder = await tx.purchaseOrder.upsert({
      where: { id: ids.purchaseOrder },
      update: {},
      create: {
        id: ids.purchaseOrder,
        tenantId: tenant.id,
        poNumber: "PO-2026-000001",
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        status: PurchaseOrderStatus.DRAFT,
        currency: "THB",
        notes: "Initial stocking order for USB-C Adapter.",
        lines: {
          connectOrCreate: {
            where: { id: ids.purchaseOrderLine },
            create: { id: ids.purchaseOrderLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 1000, unitCost: "85.00" },
          },
        },
      },
      include: { lines: true },
    });

    return { supplier, warehouse, product, purchaseOrder };
  });

  console.log("Seeded:");
  console.log(`  tenant          ${tenant.name} (${tenant.slug})`);
  console.log(`  users           admin@siamdistribution.co.th / procurement@siamdistribution.co.th / warehouse@siamdistribution.co.th`);
  console.log(`  password        ${SEED_DEV_PASSWORD} (all seeded users)`);
  console.log(`  supplier        ${supplier.name} (${supplier.code})`);
  console.log(`  warehouse       ${warehouse.name} (${warehouse.code})`);
  console.log(`  product         ${product.sku} — ${product.name} (THB ${product.costPrice})`);
  console.log(`  purchase order  ${purchaseOrder.poNumber} — 1000 x ${product.sku} (${purchaseOrder.status})`);
  console.log("");
  console.log("Demo walkthrough from here: approve -> create inbound shipment -> book -> dispatch -> arrive -> receive 600 -> receive 400.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
