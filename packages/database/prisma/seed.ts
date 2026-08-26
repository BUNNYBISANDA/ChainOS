/**
 * Deterministic development seed: one realistic Thailand-based tenant
 * ("Siam Distribution Co., Ltd.") with four users, one supplier, one
 * customer, one product, one warehouse, a single DRAFT purchase order (the
 * phase 1 inbound demo — see docs/adr/0004-purchase-order-lifecycle.md),
 * and a single DRAFT sales order (the phase 2 outbound demo — see
 * docs/adr/0005-inventory-reservation-model.md). Both orders are
 * deliberately left at DRAFT: their full lifecycles are meant to be walked
 * through live from the UI, not pre-baked into seed data. Every row is
 * upserted by a fixed id/natural key, so `pnpm db:seed` is safe to re-run
 * — it converges to the same state instead of duplicating rows. For a
 * clean slate use `pnpm --filter @chainos/database reset` (drops +
 * re-migrates + reseeds).
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
import {
  PurchaseOrderStatus,
  SalesOrderStatus,
  ShipmentDirection,
  ShipmentEventType,
  ShipmentExceptionSeverity,
  ShipmentExceptionStatus,
  ShipmentExceptionType,
  ShipmentStatus,
  StockMovementType,
  TrackingEventSource,
  prisma,
  withTenant,
} from "../src/index";

export const SEED_DEV_PASSWORD = "ChainOS123!";

const ids = {
  tenant: "00000000-0000-4000-8000-000000000001",
  roleAdmin: "00000000-0000-4000-8000-000000000010",
  roleProcurement: "00000000-0000-4000-8000-000000000011",
  roleWarehouse: "00000000-0000-4000-8000-000000000012",
  roleSales: "00000000-0000-4000-8000-000000000013",
  userAdmin: "00000000-0000-4000-8000-000000000020",
  userProcurement: "00000000-0000-4000-8000-000000000021",
  userWarehouse: "00000000-0000-4000-8000-000000000022",
  userSales: "00000000-0000-4000-8000-000000000023",
  supplier: "00000000-0000-4000-8000-000000000030",
  warehouse: "00000000-0000-4000-8000-000000000040",
  product: "00000000-0000-4000-8000-000000000050",
  purchaseOrder: "00000000-0000-4000-8000-000000000060",
  purchaseOrderLine: "00000000-0000-4000-8000-000000000061",
  customer: "00000000-0000-4000-8000-000000000070",
  salesOrder: "00000000-0000-4000-8000-000000000080",
  salesOrderLine: "00000000-0000-4000-8000-000000000081",
  // Phase 3 shipment-visibility demo (see main() below). Numbered
  // PO/SHP-2026-000090 deliberately, well clear of the low document
  // numbers the inbound/outbound demos above hand out — this scenario
  // must never collide with a real PO/shipment created by walking the
  // phase 1/2 demos through the UI, so it doesn't share their counters.
  purchaseOrderVisibility: "00000000-0000-4000-8000-000000000090",
  purchaseOrderLineVisibility: "00000000-0000-4000-8000-000000000091",
  shipmentVisibility: "00000000-0000-4000-8000-000000000092",
  shipmentEventCreated: "00000000-0000-4000-8000-000000000093",
  shipmentEventBooked: "00000000-0000-4000-8000-000000000094",
  shipmentEventDispatched: "00000000-0000-4000-8000-000000000095",
  shipmentEventLocation1: "00000000-0000-4000-8000-000000000096",
  shipmentEventEtaUpdated: "00000000-0000-4000-8000-000000000097",
  shipmentEventLocation2: "00000000-0000-4000-8000-000000000098",
  shipmentExceptionEtaExceeded: "00000000-0000-4000-8000-000000000099",
  shipmentExceptionTrackingStale: "00000000-0000-4000-8000-00000000009a",

  // Phase 4 analytics demo (see main() below) — deterministic KPI/OTIF/
  // supplier-performance/inventory-risk fixtures, numbered well clear of
  // both the live-walkthrough documents above and the phase 3 visibility
  // block. Every expected value is documented inline and asserted exactly
  // in apps/api/test/integration/analytics.integration-spec.ts.
  supplierLate: "00000000-0000-4000-8000-0000000000b0",
  customerOtif: "00000000-0000-4000-8000-0000000000b1",
  productRiskA: "00000000-0000-4000-8000-0000000000b2",
  productRiskB: "00000000-0000-4000-8000-0000000000b3",
  poHealthy: "00000000-0000-4000-8000-0000000000b4",
  poHealthyLine: "00000000-0000-4000-8000-0000000000b5",
  poHealthyReceipt: "00000000-0000-4000-8000-0000000000b6",
  poHealthyReceiptLine: "00000000-0000-4000-8000-0000000000b7",
  poOverdue: "00000000-0000-4000-8000-0000000000b8",
  poOverdueLine: "00000000-0000-4000-8000-0000000000b9",
  poPartial: "00000000-0000-4000-8000-0000000000ba",
  poPartialLine: "00000000-0000-4000-8000-0000000000bb",
  poPartialReceipt: "00000000-0000-4000-8000-0000000000bc",
  poPartialReceiptLine: "00000000-0000-4000-8000-0000000000bd",
  poLateSupplier: "00000000-0000-4000-8000-0000000000be",
  poLateSupplierLine: "00000000-0000-4000-8000-0000000000bf",
  poLateSupplierReceipt: "00000000-0000-4000-8000-0000000000c0",
  poLateSupplierReceiptLine: "00000000-0000-4000-8000-0000000000c1",
  soOtifPass: "00000000-0000-4000-8000-0000000000c2",
  soOtifPassLine: "00000000-0000-4000-8000-0000000000c3",
  shipmentOtifPass: "00000000-0000-4000-8000-0000000000c4",
  soOtifFailIncomplete: "00000000-0000-4000-8000-0000000000c5",
  soOtifFailIncompleteLine: "00000000-0000-4000-8000-0000000000c6",
  shipmentOtifFailIncomplete: "00000000-0000-4000-8000-0000000000c7",
  soOtifFailLate: "00000000-0000-4000-8000-0000000000c8",
  soOtifFailLateLine: "00000000-0000-4000-8000-0000000000c9",
  shipmentOtifFailLate: "00000000-0000-4000-8000-0000000000ca",
  stockLevelRiskA: "00000000-0000-4000-8000-0000000000cb",
  stockMovementRiskA: "00000000-0000-4000-8000-0000000000cc",
  soRiskDemandA: "00000000-0000-4000-8000-0000000000cd",
  soRiskDemandALine: "00000000-0000-4000-8000-0000000000ce",
  stockLevelRiskB: "00000000-0000-4000-8000-0000000000cf",
  stockMovementRiskB: "00000000-0000-4000-8000-0000000000d0",
  poRiskIncomingB: "00000000-0000-4000-8000-0000000000d1",
  poRiskIncomingBLine: "00000000-0000-4000-8000-0000000000d2",
  soRiskDemandB: "00000000-0000-4000-8000-0000000000d3",
  soRiskDemandBLine: "00000000-0000-4000-8000-0000000000d4",
} as const;

/** Hours-ago helper for the shipment-visibility demo timestamps below. */
const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);
/** Days-ago/-from-now helpers for the phase 4 analytics demo timestamps below. */
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const ALL_PERMISSIONS = [
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
  "analytics:control-tower:read",
  "analytics:procurement:read",
  "analytics:inventory:read",
  "analytics:fulfillment:read",
  "analytics:logistics:read",
  "analytics:suppliers:read",
  "exceptions:read",
];

// Regular warehouse users must NOT be able to approve a PO (task spec) —
// only Admin and Procurement Manager carry "po:approve". Procurement
// Manager must NOT automatically receive sales-order permissions (phase 2
// task spec) — the commercial outbound side belongs to Sales Manager, same
// split as Admin/Procurement own the commercial inbound side.
//
// Phase 4: "analytics:control-tower:read" and "exceptions:read" are
// granted to every role below — the Control Tower is everyone's shared
// operational home page, and ChainOS has no single "sees everything"
// role besides Admin (see docs/architecture/analytics.md). Each role
// additionally gets its own domain-specific analytics permission(s).
const PROCUREMENT_PERMISSIONS = [
  "procurement:write",
  "po:create",
  "po:approve",
  "po:receive",
  "catalog:write",
  "analytics:control-tower:read",
  "analytics:procurement:read",
  "analytics:suppliers:read",
  "exceptions:read",
];

// Physical/warehouse-side actions: receiving inbound, allocating/fulfilling
// outbound — mirrors the po:receive vs po:approve split (see ADR 0006).
const WAREHOUSE_PERMISSIONS = [
  "inventory:write",
  "po:receive",
  "sales-order:allocate",
  "sales-order:fulfill",
  "shipment:create",
  "shipment:update",
  "shipment:tracking:create",
  "shipment:eta:update",
  "shipment:exceptions:read",
  "analytics:control-tower:read",
  "analytics:inventory:read",
  "analytics:logistics:read",
  "exceptions:read",
];

// Commercial/sales-side actions: creating, confirming, cancelling a sales
// order, and maintaining customers — never allocate/fulfill (see ADR 0006).
const SALES_PERMISSIONS = [
  "customer:write",
  "sales-order:create",
  "sales-order:confirm",
  "sales-order:cancel",
  "analytics:control-tower:read",
  "analytics:fulfillment:read",
  "exceptions:read",
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "siam-distribution" },
    update: { name: "Siam Distribution Co., Ltd." },
    create: { id: ids.tenant, slug: "siam-distribution", name: "Siam Distribution Co., Ltd." },
  });

  const passwordHash = await bcrypt.hash(SEED_DEV_PASSWORD, 10);

  const {
    supplier,
    warehouse,
    product,
    purchaseOrder,
    customer,
    salesOrder,
    visibilityShipment,
    supplierLate,
    customerOtif,
    productRiskA,
    productRiskB,
    poOverdue,
    poPartial,
  } = await withTenant(tenant.id, async (tx) => {
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
    const roleSales = await tx.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Sales Manager" } },
      update: { permissions: SALES_PERMISSIONS },
      create: {
        id: ids.roleSales,
        tenantId: tenant.id,
        name: "Sales Manager",
        permissions: SALES_PERMISSIONS,
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
    await tx.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: "sales@siamdistribution.co.th" } },
      update: { passwordHash, roleId: roleSales.id },
      create: {
        id: ids.userSales,
        tenantId: tenant.id,
        email: "sales@siamdistribution.co.th",
        name: "Kittipong Ratanakorn",
        passwordHash,
        roleId: roleSales.id,
      },
    });

    const supplier = await tx.supplier.upsert({
      where: { id: ids.supplier },
      update: { tenantId: tenant.id, code: "SUP-001", name: "Shenzhen Components Ltd.", latitude: "22.5431", longitude: "114.0579" },
      create: {
        id: ids.supplier,
        tenantId: tenant.id,
        code: "SUP-001",
        name: "Shenzhen Components Ltd.",
        country: "China",
        contactName: "Li Wei",
        email: "sales@shenzhencomponents.example.cn",
        phone: "+86-755-555-0198",
        latitude: "22.5431",
        longitude: "114.0579",
      },
    });

    // Phase 4: on-time supplier1 above, deliberately-late supplier2 below —
    // feeds the supplier-performance table (see docs/analytics/kpi-definitions.md).
    const supplierLate = await tx.supplier.upsert({
      where: { id: ids.supplierLate },
      update: { tenantId: tenant.id, code: "SUP-003", name: "Guangzhou Freight Components Co.", latitude: "23.1291", longitude: "113.2644" },
      create: {
        id: ids.supplierLate,
        tenantId: tenant.id,
        code: "SUP-003",
        name: "Guangzhou Freight Components Co.",
        country: "China",
        contactName: "Chen Jing",
        email: "sales@guangzhoufreight.example.cn",
        phone: "+86-20-555-0177",
        latitude: "23.1291",
        longitude: "113.2644",
      },
    });

    const warehouse = await tx.warehouse.upsert({
      where: { id: ids.warehouse },
      update: { tenantId: tenant.id, code: "BKK-DC-01", name: "Bangkok Distribution Center", latitude: "13.7563", longitude: "100.5018" },
      create: {
        id: ids.warehouse,
        tenantId: tenant.id,
        code: "BKK-DC-01",
        name: "Bangkok Distribution Center",
        address: "123 Bang Na-Trat Road, Bang Na",
        province: "Bangkok",
        country: "Thailand",
        latitude: "13.7563",
        longitude: "100.5018",
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

    // Phase 4: two more SKUs used ONLY by the golden inventory-risk fixture
    // below, kept off product/warehouse ELEC-001/BKK-DC-01's other demand —
    // isolating them is what makes the fixture's expected numbers exact.
    const productRiskA = await tx.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: "ELEC-002" } },
      update: { name: "Braided USB-C Cable (2m)", category: "Electronics", costPrice: "45.00" },
      create: {
        id: ids.productRiskA,
        tenantId: tenant.id,
        sku: "ELEC-002",
        name: "Braided USB-C Cable (2m)",
        description: "2m braided USB-C to USB-C cable, 100W rated",
        category: "Electronics",
        uom: "EACH",
        costPrice: "45.00",
      },
    });
    const productRiskB = await tx.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: "ELEC-003" } },
      update: { name: "15W Wireless Charging Pad", category: "Electronics", costPrice: "260.00" },
      create: {
        id: ids.productRiskB,
        tenantId: tenant.id,
        sku: "ELEC-003",
        name: "15W Wireless Charging Pad",
        description: "Qi-certified 15W wireless charging pad",
        category: "Electronics",
        uom: "EACH",
        costPrice: "260.00",
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

    const customer = await tx.customer.upsert({
      where: { id: ids.customer },
      update: {
        tenantId: tenant.id,
        customerCode: "CUS-2026-000001",
        companyName: "Bangkok Electronics Retail Co., Ltd.",
        latitude: "13.7367",
        longitude: "100.5606",
      },
      create: {
        id: ids.customer,
        tenantId: tenant.id,
        customerCode: "CUS-2026-000001",
        companyName: "Bangkok Electronics Retail Co., Ltd.",
        contactName: "Nattapong Srisawat",
        email: "purchasing@bangkokelectronics.example.th",
        phone: "+66-2-555-0142",
        address: "88 Sukhumvit Road",
        city: "Bangkok",
        province: "Bangkok",
        country: "Thailand",
        latitude: "13.7367",
        longitude: "100.5606",
      },
    });

    // Phase 4: second customer used only by the golden OTIF fixture below.
    const customerOtif = await tx.customer.upsert({
      where: { id: ids.customerOtif },
      update: { tenantId: tenant.id, customerCode: "CUS-2026-000090", companyName: "Chiang Mai Gadget House Co., Ltd.", latitude: "18.7883", longitude: "98.9853" },
      create: {
        id: ids.customerOtif,
        tenantId: tenant.id,
        customerCode: "CUS-2026-000090",
        companyName: "Chiang Mai Gadget House Co., Ltd.",
        contactName: "Sirilak Boonmee",
        email: "purchasing@cmgadgethouse.example.th",
        phone: "+66-53-555-0121",
        address: "45 Nimmanhaemin Road",
        city: "Chiang Mai",
        province: "Chiang Mai",
        country: "Thailand",
        latitude: "18.7883",
        longitude: "98.9853",
      },
    });

    // Keep the CUS-2026 sequence consistent with this hardcoded customer
    // code, so the next customer created through the app is
    // CUS-2026-000002, not a colliding CUS-2026-000001 (same reasoning as
    // the PO-2026 sequence above).
    await tx.numberSequence.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "CUS-2026" } },
      update: { value: 1 },
      create: { tenantId: tenant.id, key: "CUS-2026", value: 1 },
    });

    // Keep the SO-2026 sequence consistent with this hardcoded SO number,
    // so the next sales order created through the app is SO-2026-000002.
    await tx.numberSequence.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "SO-2026" } },
      update: { value: 1 },
      create: { tenantId: tenant.id, key: "SO-2026", value: 1 },
    });

    // Left at DRAFT on purpose, same philosophy as the PO above: confirm ->
    // allocate -> fulfill is meant to be walked through live from the UI.
    const salesOrder = await tx.salesOrder.upsert({
      where: { id: ids.salesOrder },
      update: {},
      create: {
        id: ids.salesOrder,
        tenantId: tenant.id,
        orderNumber: "SO-2026-000001",
        customerId: customer.id,
        warehouseId: warehouse.id,
        status: SalesOrderStatus.DRAFT,
        currency: "THB",
        notes: "Retail restock order for USB-C Adapter.",
        lines: {
          connectOrCreate: {
            where: { id: ids.salesOrderLine },
            create: { id: ids.salesOrderLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 300, unitPrice: "120.00" },
          },
        },
      },
      include: { lines: true },
    });

    // -----------------------------------------------------------------
    // Phase 3 shipment-visibility demo: a complete, already-in-progress
    // INBOUND shipment — full lifecycle + tracking event history, live
    // origin/current/destination coordinates for the map, an ETA revision,
    // and both exception types (ETA_EXCEEDED and TRACKING_STALE) already
    // open. Unlike the DRAFT PO/SO above, this one is deliberately NOT
    // left for a live click-through: the point is to have the visibility
    // UI (timeline, map, ETA card, exceptions) fully populated the moment
    // you load the page. Every row is upserted by a fixed id, so re-running
    // the seed converges instead of duplicating; timestamps are computed
    // once, relative to the first seed run, and then left alone by later
    // reseeds (`update: {}`) — the *displayed* delay still grows correctly
    // over time because exception severity/age are recomputed live by
    // ShipmentsService.evaluateExceptions() on every read.
    const visibilityPo = await tx.purchaseOrder.upsert({
      where: { id: ids.purchaseOrderVisibility },
      update: {},
      create: {
        id: ids.purchaseOrderVisibility,
        tenantId: tenant.id,
        poNumber: "PO-2026-000090",
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        status: PurchaseOrderStatus.SHIPPED,
        currency: "THB",
        notes: "Container restock order — phase 3 shipment-visibility demo.",
        approvedByUserId: ids.userProcurement,
        approvedAt: hoursAgo(72),
        lines: {
          connectOrCreate: {
            where: { id: ids.purchaseOrderLineVisibility },
            create: { id: ids.purchaseOrderLineVisibility, tenantId: tenant.id, productId: product.id, qtyOrdered: 500, unitCost: "85.00" },
          },
        },
      },
    });

    const plannedDepartureAt = hoursAgo(70);
    const plannedArrivalAt = hoursAgo(45);
    const actualDepartureAt = hoursAgo(68);
    // Carrier's revised ETA, set 55h ago (see the ETA_UPDATED event below):
    // still in the past relative to "now", so ETA_EXCEEDED stays open.
    const estimatedArrivalAt = hoursAgo(30);
    // Last tracking ping was 40h ago — past the 24h staleness threshold,
    // so TRACKING_STALE stays open too alongside ETA_EXCEEDED.
    const lastTrackingEventAt = hoursAgo(40);

    const visibilityShipment = await tx.shipment.upsert({
      where: { id: ids.shipmentVisibility },
      update: {},
      create: {
        id: ids.shipmentVisibility,
        tenantId: tenant.id,
        shipmentNumber: "SHP-2026-000090",
        direction: ShipmentDirection.INBOUND,
        status: ShipmentStatus.IN_TRANSIT,
        purchaseOrderId: visibilityPo.id,
        carrier: "Pacific Star Line",
        trackingNumber: "PSL-SHZ-BKK-88213",
        originName: "Shenzhen Components Ltd.",
        originLatitude: "22.5431",
        originLongitude: "114.0579",
        destinationName: "Bangkok Distribution Center",
        destinationLatitude: "13.7563",
        destinationLongitude: "100.5018",
        currentLocationName: "Laem Chabang Port (awaiting berth)",
        currentLatitude: "13.0827",
        currentLongitude: "100.8830",
        plannedDepartureAt,
        plannedArrivalAt,
        actualDepartureAt,
        estimatedArrivalAt,
        lastTrackingEventAt,
        createdAt: hoursAgo(72),
      },
    });

    const visibilityEvents = [
      {
        id: ids.shipmentEventCreated,
        eventType: ShipmentEventType.CREATED,
        status: ShipmentStatus.CREATED,
        eventTimestamp: hoursAgo(72),
        source: TrackingEventSource.SYSTEM,
        createdByUserId: ids.userProcurement,
      },
      {
        id: ids.shipmentEventBooked,
        eventType: ShipmentEventType.BOOKED,
        status: ShipmentStatus.BOOKED,
        eventTimestamp: hoursAgo(71),
        source: TrackingEventSource.SYSTEM,
        createdByUserId: ids.userProcurement,
      },
      {
        id: ids.shipmentEventDispatched,
        eventType: ShipmentEventType.DISPATCHED,
        status: ShipmentStatus.IN_TRANSIT,
        eventTimestamp: actualDepartureAt,
        source: TrackingEventSource.SYSTEM,
        createdByUserId: ids.userProcurement,
      },
      {
        id: ids.shipmentEventLocation1,
        eventType: ShipmentEventType.LOCATION_UPDATED,
        eventTimestamp: hoursAgo(60),
        locationName: "South China Sea (in transit)",
        latitude: "18.0000",
        longitude: "112.5000",
        source: TrackingEventSource.MANUAL,
        notes: "Carrier check-in via shipping agent.",
        createdByUserId: ids.userWarehouse,
      },
      {
        id: ids.shipmentEventEtaUpdated,
        eventType: ShipmentEventType.ETA_UPDATED,
        eventTimestamp: hoursAgo(55),
        source: TrackingEventSource.MANUAL,
        notes: "Port congestion reported at Laem Chabang; carrier revised the ETA.",
        metadata: { previousEta: plannedArrivalAt.toISOString(), newEta: estimatedArrivalAt.toISOString() },
        createdByUserId: ids.userWarehouse,
      },
      {
        id: ids.shipmentEventLocation2,
        eventType: ShipmentEventType.LOCATION_UPDATED,
        eventTimestamp: lastTrackingEventAt,
        locationName: "Laem Chabang Port (awaiting berth)",
        latitude: "13.0827",
        longitude: "100.8830",
        source: TrackingEventSource.MANUAL,
        notes: "Vessel anchored offshore, awaiting berth assignment.",
        createdByUserId: ids.userWarehouse,
      },
    ] as const;

    for (const event of visibilityEvents) {
      await tx.shipmentEvent.upsert({
        where: { id: event.id },
        update: {},
        create: {
          id: event.id,
          tenantId: tenant.id,
          shipmentId: visibilityShipment.id,
          eventType: event.eventType,
          status: "status" in event ? event.status : undefined,
          eventTimestamp: event.eventTimestamp,
          occurredAt: event.eventTimestamp,
          locationName: "locationName" in event ? event.locationName : undefined,
          latitude: "latitude" in event ? event.latitude : undefined,
          longitude: "longitude" in event ? event.longitude : undefined,
          source: event.source,
          note: "notes" in event ? event.notes : undefined,
          notes: "notes" in event ? event.notes : undefined,
          metadata: "metadata" in event ? event.metadata : undefined,
          createdByUserId: event.createdByUserId,
        },
      });
    }

    const delayedByMinutes = Math.floor((Date.now() - estimatedArrivalAt.getTime()) / 60000);
    await tx.shipmentException.upsert({
      where: { id: ids.shipmentExceptionEtaExceeded },
      update: {},
      create: {
        id: ids.shipmentExceptionEtaExceeded,
        tenantId: tenant.id,
        shipmentId: visibilityShipment.id,
        type: ShipmentExceptionType.ETA_EXCEEDED,
        severity: ShipmentExceptionSeverity.CRITICAL,
        status: ShipmentExceptionStatus.OPEN,
        detectedAt: estimatedArrivalAt,
        message: `Estimated arrival was exceeded by ${delayedByMinutes} minutes.`,
        metadata: { estimatedArrivalAt: estimatedArrivalAt.toISOString(), delayedByMinutes },
      },
    });

    await tx.shipmentException.upsert({
      where: { id: ids.shipmentExceptionTrackingStale },
      update: {},
      create: {
        id: ids.shipmentExceptionTrackingStale,
        tenantId: tenant.id,
        shipmentId: visibilityShipment.id,
        type: ShipmentExceptionType.TRACKING_STALE,
        severity: ShipmentExceptionSeverity.WARNING,
        status: ShipmentExceptionStatus.OPEN,
        detectedAt: hoursAgo(16), // 24h after the last tracking event, 40h ago
        message: "No tracking update for more than 24 hours.",
        metadata: { lastTrackingEventAt: lastTrackingEventAt.toISOString(), staleThresholdHours: 24 },
      },
    });

    // -----------------------------------------------------------------
    // Phase 4 analytics demo — deterministic procurement, supplier-
    // performance, OTIF, and inventory-risk fixtures. Every number below
    // is asserted exactly by apps/api/test/integration/analytics.integration-spec.ts;
    // treat the comments as the source of truth for expected values.

    // --- Procurement + supplier performance ---------------------------
    // supplier1 (SUP-001): one on-time RECEIVED PO, one open overdue PO,
    // one PARTIALLY_RECEIVED PO -> supplier1 on-time% = 1/1 = 100%.
    // supplierLate (SUP-002): one late RECEIVED PO -> on-time% = 0/1 = 0%.
    const poHealthy = await tx.purchaseOrder.upsert({
      where: { id: ids.poHealthy },
      update: {},
      create: {
        id: ids.poHealthy,
        tenantId: tenant.id,
        poNumber: "PO-2026-000100",
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        status: PurchaseOrderStatus.RECEIVED,
        currency: "THB",
        notes: "Phase 4 demo — on-time, fully received (200 units, 21 days lead time).",
        orderDate: daysAgo(26),
        expectedDeliveryDate: daysAgo(20),
        approvedByUserId: ids.userProcurement,
        approvedAt: daysAgo(25),
        lines: {
          connectOrCreate: {
            where: { id: ids.poHealthyLine },
            create: { id: ids.poHealthyLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 200, qtyReceived: 200, unitCost: "85.00" },
          },
        },
      },
    });
    await tx.goodsReceipt.upsert({
      where: { id: ids.poHealthyReceipt },
      update: {},
      create: {
        id: ids.poHealthyReceipt,
        tenantId: tenant.id,
        purchaseOrderId: poHealthy.id,
        warehouseId: warehouse.id,
        receivedByUserId: ids.userWarehouse,
        receivedAt: daysAgo(21), // before expectedDeliveryDate (daysAgo(20)) -> on time
        lines: {
          connectOrCreate: {
            where: { id: ids.poHealthyReceiptLine },
            create: { id: ids.poHealthyReceiptLine, tenantId: tenant.id, purchaseOrderLineId: ids.poHealthyLine, productId: product.id, qtyReceived: 200 },
          },
        },
      },
    });

    const poOverdue = await tx.purchaseOrder.upsert({
      where: { id: ids.poOverdue },
      update: {},
      create: {
        id: ids.poOverdue,
        tenantId: tenant.id,
        poNumber: "PO-2026-000101",
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        status: PurchaseOrderStatus.APPROVED,
        currency: "THB",
        notes: "Phase 4 demo — open and overdue (expected delivery date has passed).",
        orderDate: daysAgo(12),
        expectedDeliveryDate: daysAgo(5),
        approvedByUserId: ids.userProcurement,
        approvedAt: daysAgo(11),
        lines: {
          connectOrCreate: {
            where: { id: ids.poOverdueLine },
            create: { id: ids.poOverdueLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 150, unitCost: "85.00" },
          },
        },
      },
    });

    const poPartial = await tx.purchaseOrder.upsert({
      where: { id: ids.poPartial },
      update: {},
      create: {
        id: ids.poPartial,
        tenantId: tenant.id,
        poNumber: "PO-2026-000102",
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
        currency: "THB",
        notes: "Phase 4 demo — partially received (150 of 300), not yet overdue.",
        orderDate: daysAgo(8),
        expectedDeliveryDate: daysFromNow(5),
        approvedByUserId: ids.userProcurement,
        approvedAt: daysAgo(7),
        lines: {
          connectOrCreate: {
            where: { id: ids.poPartialLine },
            create: { id: ids.poPartialLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 300, qtyReceived: 150, unitCost: "85.00" },
          },
        },
      },
    });
    await tx.goodsReceipt.upsert({
      where: { id: ids.poPartialReceipt },
      update: {},
      create: {
        id: ids.poPartialReceipt,
        tenantId: tenant.id,
        purchaseOrderId: poPartial.id,
        warehouseId: warehouse.id,
        receivedByUserId: ids.userWarehouse,
        receivedAt: daysAgo(2),
        lines: {
          connectOrCreate: {
            where: { id: ids.poPartialReceiptLine },
            create: { id: ids.poPartialReceiptLine, tenantId: tenant.id, purchaseOrderLineId: ids.poPartialLine, productId: product.id, qtyReceived: 150 },
          },
        },
      },
    });

    const poLateSupplier = await tx.purchaseOrder.upsert({
      where: { id: ids.poLateSupplier },
      update: {},
      create: {
        id: ids.poLateSupplier,
        tenantId: tenant.id,
        poNumber: "PO-2026-000103",
        supplierId: supplierLate.id,
        warehouseId: warehouse.id,
        status: PurchaseOrderStatus.RECEIVED,
        currency: "THB",
        notes: "Phase 4 demo — supplier OTIF fixture, received 5 days late.",
        orderDate: daysAgo(31),
        expectedDeliveryDate: daysAgo(20),
        approvedByUserId: ids.userProcurement,
        approvedAt: daysAgo(30),
        lines: {
          connectOrCreate: {
            where: { id: ids.poLateSupplierLine },
            create: { id: ids.poLateSupplierLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 100, qtyReceived: 100, unitCost: "88.00" },
          },
        },
      },
    });
    await tx.goodsReceipt.upsert({
      where: { id: ids.poLateSupplierReceipt },
      update: {},
      create: {
        id: ids.poLateSupplierReceipt,
        tenantId: tenant.id,
        purchaseOrderId: poLateSupplier.id,
        warehouseId: warehouse.id,
        receivedByUserId: ids.userWarehouse,
        receivedAt: daysAgo(15), // 5 days after expectedDeliveryDate (daysAgo(20)) -> late
        lines: {
          connectOrCreate: {
            where: { id: ids.poLateSupplierReceiptLine },
            create: { id: ids.poLateSupplierReceiptLine, tenantId: tenant.id, purchaseOrderLineId: ids.poLateSupplierLine, productId: product.id, qtyReceived: 100 },
          },
        },
      },
    });

    // Physical receipts for the three RECEIVED POs above (450 units total)
    // — keeps ELEC-001's inventory ledger consistent with what Procurement
    // recorded, same as InventoryService.handlePoReceived would post.
    for (const receipt of [
      { movementId: "00000000-0000-4000-8000-0000000000d5", lineId: ids.poHealthyLine, receiptLineId: ids.poHealthyReceiptLine, qty: 200 },
      { movementId: "00000000-0000-4000-8000-0000000000d6", lineId: ids.poPartialLine, receiptLineId: ids.poPartialReceiptLine, qty: 150 },
      { movementId: "00000000-0000-4000-8000-0000000000d7", lineId: ids.poLateSupplierLine, receiptLineId: ids.poLateSupplierReceiptLine, qty: 100 },
    ]) {
      await tx.stockMovement.upsert({
        where: { id: receipt.movementId },
        update: {},
        create: {
          id: receipt.movementId,
          tenantId: tenant.id,
          productId: product.id,
          warehouseId: warehouse.id,
          type: StockMovementType.RECEIPT,
          quantityDelta: receipt.qty,
          purchaseOrderLineId: receipt.lineId,
          goodsReceiptLineId: receipt.receiptLineId,
        },
      });
    }

    // --- Customer OTIF golden fixture ----------------------------------
    // Three delivered orders -> OTIF = 1 pass / 3 eligible = 33.33% (spec §50).
    // Requested delivery date is the same for all three (daysAgo(10)):
    //   A: 100/100 delivered daysAgo(11) (before requested) -> PASS
    //   B:  80/100 delivered daysAgo(11) (before requested, incomplete) -> FAIL (incomplete)
    //   C: 100/100 delivered daysAgo(8)  (2 days after requested) -> FAIL (late)
    const requestedDeliveryDate = daysAgo(10);

    const soOtifPass = await tx.salesOrder.upsert({
      where: { id: ids.soOtifPass },
      update: {},
      create: {
        id: ids.soOtifPass,
        tenantId: tenant.id,
        orderNumber: "SO-2026-000100",
        customerId: customerOtif.id,
        warehouseId: warehouse.id,
        orderDate: daysAgo(15),
        requestedDeliveryDate,
        currency: "THB",
        status: SalesOrderStatus.FULFILLED,
        notes: "Phase 4 OTIF demo — on time, in full.",
        confirmedByUserId: ids.userSales,
        confirmedAt: daysAgo(14),
        lines: {
          connectOrCreate: {
            where: { id: ids.soOtifPassLine },
            create: { id: ids.soOtifPassLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 100, qtyFulfilled: 100, unitPrice: "120.00" },
          },
        },
      },
    });
    const soOtifFailIncomplete = await tx.salesOrder.upsert({
      where: { id: ids.soOtifFailIncomplete },
      update: {},
      create: {
        id: ids.soOtifFailIncomplete,
        tenantId: tenant.id,
        orderNumber: "SO-2026-000101",
        customerId: customerOtif.id,
        warehouseId: warehouse.id,
        orderDate: daysAgo(15),
        requestedDeliveryDate,
        currency: "THB",
        status: SalesOrderStatus.PARTIALLY_FULFILLED,
        notes: "Phase 4 OTIF demo — delivered on time but incomplete (80 of 100).",
        confirmedByUserId: ids.userSales,
        confirmedAt: daysAgo(14),
        lines: {
          connectOrCreate: {
            where: { id: ids.soOtifFailIncompleteLine },
            create: { id: ids.soOtifFailIncompleteLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 100, qtyFulfilled: 80, unitPrice: "120.00" },
          },
        },
      },
    });
    const soOtifFailLate = await tx.salesOrder.upsert({
      where: { id: ids.soOtifFailLate },
      update: {},
      create: {
        id: ids.soOtifFailLate,
        tenantId: tenant.id,
        orderNumber: "SO-2026-000102",
        customerId: customerOtif.id,
        warehouseId: warehouse.id,
        orderDate: daysAgo(15),
        requestedDeliveryDate,
        currency: "THB",
        status: SalesOrderStatus.FULFILLED,
        notes: "Phase 4 OTIF demo — delivered in full but 2 days late.",
        confirmedByUserId: ids.userSales,
        confirmedAt: daysAgo(14),
        lines: {
          connectOrCreate: {
            where: { id: ids.soOtifFailLateLine },
            create: { id: ids.soOtifFailLateLine, tenantId: tenant.id, productId: product.id, qtyOrdered: 100, qtyFulfilled: 100, unitPrice: "120.00" },
          },
        },
      },
    });

    for (const shipment of [
      { id: ids.shipmentOtifPass, number: "SHP-2026-000100", salesOrderId: soOtifPass.id, deliveredAt: daysAgo(11) },
      { id: ids.shipmentOtifFailIncomplete, number: "SHP-2026-000101", salesOrderId: soOtifFailIncomplete.id, deliveredAt: daysAgo(11) },
      { id: ids.shipmentOtifFailLate, number: "SHP-2026-000102", salesOrderId: soOtifFailLate.id, deliveredAt: daysAgo(8) },
    ]) {
      await tx.shipment.upsert({
        where: { id: shipment.id },
        update: {},
        create: {
          id: shipment.id,
          tenantId: tenant.id,
          shipmentNumber: shipment.number,
          direction: ShipmentDirection.OUTBOUND,
          status: ShipmentStatus.DELIVERED,
          salesOrderId: shipment.salesOrderId,
          originWarehouseId: warehouse.id,
          destCustomerId: customerOtif.id,
          originName: warehouse.name,
          destinationName: customerOtif.companyName,
          plannedDepartureAt: new Date(shipment.deliveredAt.getTime() - 3 * 24 * 60 * 60 * 1000),
          plannedArrivalAt: requestedDeliveryDate,
          actualDepartureAt: new Date(shipment.deliveredAt.getTime() - 2 * 24 * 60 * 60 * 1000),
          actualArrivalAt: shipment.deliveredAt,
          estimatedArrivalAt: requestedDeliveryDate,
          deliveredAt: shipment.deliveredAt,
          lastTrackingEventAt: shipment.deliveredAt,
          createdAt: new Date(shipment.deliveredAt.getTime() - 4 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Physical fulfillment ledger for the three OTIF orders (280 units
    // total). Reservation bookkeeping is deliberately not replayed for
    // these closed historical fixtures (documented seed simplification —
    // see docs/analytics/kpi-definitions.md); OTIF itself only reads
    // SalesOrder.status and Shipment.deliveredAt, neither of which depends
    // on StockLevel.quantityReserved.
    for (const fulfillment of [
      { movementId: "00000000-0000-4000-8000-0000000000d8", lineId: ids.soOtifPassLine, qty: 100 },
      { movementId: "00000000-0000-4000-8000-0000000000d9", lineId: ids.soOtifFailIncompleteLine, qty: 80 },
      { movementId: "00000000-0000-4000-8000-0000000000da", lineId: ids.soOtifFailLateLine, qty: 100 },
    ]) {
      await tx.stockMovement.upsert({
        where: { id: fulfillment.movementId },
        update: {},
        create: {
          id: fulfillment.movementId,
          tenantId: tenant.id,
          productId: product.id,
          warehouseId: warehouse.id,
          type: StockMovementType.FULFILLMENT,
          quantityDelta: -fulfillment.qty,
          salesOrderLineId: fulfillment.lineId,
        },
      });
    }

    const elecStockLevel = await tx.stockLevel.findFirst({ where: { tenantId: tenant.id, productId: product.id, warehouseId: warehouse.id, locationId: null } });
    const elecOnHand = 200 + 150 + 100 - (100 + 80 + 100); // three receipts above minus three fulfillments = 170
    if (elecStockLevel) {
      await tx.stockLevel.update({ where: { id: elecStockLevel.id }, data: { quantityOnHand: elecOnHand } });
    } else {
      await tx.stockLevel.create({ data: { tenantId: tenant.id, productId: product.id, warehouseId: warehouse.id, quantityOnHand: elecOnHand } });
    }

    // --- Inventory risk golden fixture (spec §52) ----------------------
    // SKU A (ELEC-002): Available 300, Incoming 0, Demand 800 -> Projected -500 -> PROJECTED_STOCKOUT.
    await tx.stockLevel.upsert({
      where: { id: ids.stockLevelRiskA },
      update: { quantityOnHand: 300, quantityReserved: 0 },
      create: { id: ids.stockLevelRiskA, tenantId: tenant.id, productId: productRiskA.id, warehouseId: warehouse.id, quantityOnHand: 300, quantityReserved: 0 },
    });
    await tx.stockMovement.upsert({
      where: { id: ids.stockMovementRiskA },
      update: {},
      create: { id: ids.stockMovementRiskA, tenantId: tenant.id, productId: productRiskA.id, warehouseId: warehouse.id, type: StockMovementType.RECEIPT, quantityDelta: 300 },
    });
    await tx.salesOrder.upsert({
      where: { id: ids.soRiskDemandA },
      update: {},
      create: {
        id: ids.soRiskDemandA,
        tenantId: tenant.id,
        orderNumber: "SO-2026-000103",
        customerId: customer.id,
        warehouseId: warehouse.id,
        orderDate: daysAgo(3),
        currency: "THB",
        status: SalesOrderStatus.CONFIRMED,
        notes: "Phase 4 inventory-risk demo — SKU A (PROJECTED_STOCKOUT).",
        confirmedByUserId: ids.userSales,
        confirmedAt: daysAgo(3),
        lines: {
          connectOrCreate: {
            where: { id: ids.soRiskDemandALine },
            create: { id: ids.soRiskDemandALine, tenantId: tenant.id, productId: productRiskA.id, qtyOrdered: 800, unitPrice: "60.00" },
          },
        },
      },
    });

    // SKU B (ELEC-003): Available 1000, Incoming 500, Demand 1200 -> Projected 300 -> HEALTHY.
    await tx.stockLevel.upsert({
      where: { id: ids.stockLevelRiskB },
      update: { quantityOnHand: 1000, quantityReserved: 0 },
      create: { id: ids.stockLevelRiskB, tenantId: tenant.id, productId: productRiskB.id, warehouseId: warehouse.id, quantityOnHand: 1000, quantityReserved: 0 },
    });
    await tx.stockMovement.upsert({
      where: { id: ids.stockMovementRiskB },
      update: {},
      create: { id: ids.stockMovementRiskB, tenantId: tenant.id, productId: productRiskB.id, warehouseId: warehouse.id, type: StockMovementType.RECEIPT, quantityDelta: 1000 },
    });
    await tx.purchaseOrder.upsert({
      where: { id: ids.poRiskIncomingB },
      update: {},
      create: {
        id: ids.poRiskIncomingB,
        tenantId: tenant.id,
        poNumber: "PO-2026-000104",
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        status: PurchaseOrderStatus.APPROVED,
        currency: "THB",
        notes: "Phase 4 inventory-risk demo — SKU B incoming supply.",
        orderDate: daysAgo(4),
        expectedDeliveryDate: daysFromNow(10),
        approvedByUserId: ids.userProcurement,
        approvedAt: daysAgo(3),
        lines: {
          connectOrCreate: {
            where: { id: ids.poRiskIncomingBLine },
            create: { id: ids.poRiskIncomingBLine, tenantId: tenant.id, productId: productRiskB.id, qtyOrdered: 500, unitCost: "220.00" },
          },
        },
      },
    });
    await tx.salesOrder.upsert({
      where: { id: ids.soRiskDemandB },
      update: {},
      create: {
        id: ids.soRiskDemandB,
        tenantId: tenant.id,
        orderNumber: "SO-2026-000104",
        customerId: customer.id,
        warehouseId: warehouse.id,
        orderDate: daysAgo(3),
        currency: "THB",
        status: SalesOrderStatus.CONFIRMED,
        notes: "Phase 4 inventory-risk demo — SKU B (HEALTHY).",
        confirmedByUserId: ids.userSales,
        confirmedAt: daysAgo(3),
        lines: {
          connectOrCreate: {
            where: { id: ids.soRiskDemandBLine },
            create: { id: ids.soRiskDemandBLine, tenantId: tenant.id, productId: productRiskB.id, qtyOrdered: 1200, unitPrice: "320.00" },
          },
        },
      },
    });

    return {
      supplier,
      warehouse,
      product,
      purchaseOrder,
      customer,
      salesOrder,
      visibilityShipment,
      supplierLate,
      customerOtif,
      productRiskA,
      productRiskB,
      poOverdue,
      poPartial,
    };
  });

  console.log("Seeded:");
  console.log(`  tenant          ${tenant.name} (${tenant.slug})`);
  console.log(
    `  users           admin@siamdistribution.co.th / procurement@siamdistribution.co.th / warehouse@siamdistribution.co.th / sales@siamdistribution.co.th`,
  );
  console.log(`  password        ${SEED_DEV_PASSWORD} (all seeded users)`);
  console.log(`  supplier        ${supplier.name} (${supplier.code})`);
  console.log(`  warehouse       ${warehouse.name} (${warehouse.code})`);
  console.log(`  product         ${product.sku} — ${product.name} (THB ${product.costPrice})`);
  console.log(`  purchase order  ${purchaseOrder.poNumber} — 1000 x ${product.sku} (${purchaseOrder.status})`);
  console.log(`  customer        ${customer.companyName} (${customer.customerCode})`);
  console.log(`  sales order     ${salesOrder.orderNumber} — 300 x ${product.sku} (${salesOrder.status})`);
  console.log(
    `  visibility demo ${visibilityShipment.shipmentNumber} — ${visibilityShipment.status}, delayed + tracking-stale, ${visibilityShipment.currentLocationName}`,
  );
  console.log("");
  console.log("Inbound demo:  approve -> create inbound shipment -> book -> dispatch -> arrive -> receive 600 -> receive 400.");
  console.log("Outbound demo: confirm -> allocate -> create outbound shipment -> book/dispatch -> fulfill 200 -> fulfill 100.");
  console.log("Visibility demo: open Shipments -> SHP-2026-000090 to see the timeline, map, ETA history, and open exceptions.");
  console.log("");
  console.log("Phase 4 analytics demo (see docs/analytics/kpi-definitions.md for exact expected values):");
  console.log(`  supplier (late) ${supplierLate.name} (${supplierLate.code}) — one PO received 5 days late, OTIF 0%`);
  console.log(`  customer (OTIF) ${customerOtif.companyName} (${customerOtif.customerCode}) — 3 delivered orders, OTIF 33.33%`);
  console.log(`  risk SKU A      ${productRiskA.sku} — 300 available / 0 incoming / 800 demand -> PROJECTED_STOCKOUT`);
  console.log(`  risk SKU B      ${productRiskB.sku} — 1000 available / 500 incoming / 1200 demand -> HEALTHY`);
  console.log(`  overdue PO      ${poOverdue.poNumber} — expected ${poOverdue.expectedDeliveryDate?.toISOString().slice(0, 10)}, still open`);
  console.log(`  partial PO      ${poPartial.poNumber} — 150 of 300 received`);
  console.log("Open /control-tower to see these fixtures drive the KPIs, or /analytics/suppliers and /inventory/risk directly.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
