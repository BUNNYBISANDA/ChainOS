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
} as const;

/** Hours-ago helper for the shipment-visibility demo timestamps below. */
const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);

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
];

// Regular warehouse users must NOT be able to approve a PO (task spec) —
// only Admin and Procurement Manager carry "po:approve". Procurement
// Manager must NOT automatically receive sales-order permissions (phase 2
// task spec) — the commercial outbound side belongs to Sales Manager, same
// split as Admin/Procurement own the commercial inbound side.
const PROCUREMENT_PERMISSIONS = ["procurement:write", "po:create", "po:approve", "po:receive", "catalog:write"];

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
];

// Commercial/sales-side actions: creating, confirming, cancelling a sales
// order, and maintaining customers — never allocate/fulfill (see ADR 0006).
const SALES_PERMISSIONS = ["customer:write", "sales-order:create", "sales-order:confirm", "sales-order:cancel"];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "siam-distribution" },
    update: { name: "Siam Distribution Co., Ltd." },
    create: { id: ids.tenant, slug: "siam-distribution", name: "Siam Distribution Co., Ltd." },
  });

  const passwordHash = await bcrypt.hash(SEED_DEV_PASSWORD, 10);

  const { supplier, warehouse, product, purchaseOrder, customer, salesOrder, visibilityShipment } = await withTenant(tenant.id, async (tx) => {
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

    const customer = await tx.customer.upsert({
      where: { id: ids.customer },
      update: {
        tenantId: tenant.id,
        customerCode: "CUS-2026-000001",
        companyName: "Bangkok Electronics Retail Co., Ltd.",
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

    return { supplier, warehouse, product, purchaseOrder, customer, salesOrder, visibilityShipment };
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
