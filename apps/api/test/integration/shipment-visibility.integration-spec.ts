import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PurchaseOrderStatus } from "@chainos/database";
import {
  TestTenant,
  cleanupTestTenant,
  createTestApp,
  createTestTenant,
  loginTestTenant,
  seedProduct,
  seedPurchaseOrder,
  seedSupplier,
  seedWarehouse,
} from "./helpers";

describe("Shipment visibility and tracking", () => {
  let app: INestApplication;
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let token: string;
  let otherToken: string;
  let supplierId: string;
  let warehouseId: string;
  let productId: string;

  beforeAll(async () => {
    process.env.SHIPMENT_STALE_HOURS = "720";
    app = await createTestApp();
    tenant = await createTestTenant("shipment-visibility");
    otherTenant = await createTestTenant("shipment-visibility-other");
    token = await loginTestTenant(app, tenant);
    otherToken = await loginTestTenant(app, otherTenant);

    const supplier = await seedSupplier(tenant.tenantId, "Visibility Supplier");
    const warehouse = await seedWarehouse(tenant.tenantId, "Visibility Warehouse");
    const product = await seedProduct(tenant.tenantId, "SKU-VISIBILITY-1", "Visibility Product");
    supplierId = supplier.id;
    warehouseId = warehouse.id;
    productId = product.id;
  }, 90000);

  afterAll(async () => {
    await cleanupTestTenant(tenant.tenantId);
    await cleanupTestTenant(otherTenant.tenantId);
    delete process.env.SHIPMENT_STALE_HOURS;
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const otherAuth = () => ({ Authorization: `Bearer ${otherToken}` });

  async function createInboundShipment() {
    const purchaseOrder = await seedPurchaseOrder(
      tenant.tenantId,
      supplierId,
      warehouseId,
      productId,
      10,
      PurchaseOrderStatus.APPROVED,
    );

    const shipment = await request(app.getHttpServer())
      .post("/shipments")
      .set(auth())
      .send({ direction: "INBOUND", purchaseOrderId: purchaseOrder.id })
      .expect(201);

    return shipment.body as { id: string; shipmentNumber: string };
  }

  it("records immutable lifecycle events as a shipment advances", async () => {
    const shipment = await createInboundShipment();

    await request(app.getHttpServer()).post(`/shipments/${shipment.id}/book`).set(auth()).expect(201);
    await request(app.getHttpServer()).post(`/shipments/${shipment.id}/dispatch`).set(auth()).expect(201);

    const events = await request(app.getHttpServer()).get(`/shipments/${shipment.id}/events`).set(auth()).expect(200);
    expect(events.body.map((event: { eventType: string }) => event.eventType)).toEqual(["CREATED", "BOOKED", "DISPATCHED"]);

    const lifecycleEvent = events.body[0];
    await request(app.getHttpServer()).patch(`/shipments/${shipment.id}/events/${lifecycleEvent.id}`).set(auth()).send({ notes: "edited" }).expect(404);
    await request(app.getHttpServer()).delete(`/shipments/${shipment.id}/events/${lifecycleEvent.id}`).set(auth()).expect(404);
  });

  it("accepts manual tracking updates and projects the latest location onto the shipment", async () => {
    const shipment = await createInboundShipment();

    const tracking = await request(app.getHttpServer())
      .post(`/shipments/${shipment.id}/events`)
      .set(auth())
      .send({
        eventType: "LOCATION_UPDATED",
        locationName: "Bangkok DC gate",
        latitude: 13.7563,
        longitude: 100.5018,
        notes: "Carrier check-in",
      })
      .expect(201);

    expect(tracking.body.source).toBe("MANUAL");
    expect(tracking.body.locationName).toBe("Bangkok DC gate");

    const detail = await request(app.getHttpServer()).get(`/shipments/${shipment.id}`).set(auth()).expect(200);
    expect(detail.body.currentLocationName).toBe("Bangkok DC gate");
    expect(Number(detail.body.currentLatitude)).toBeCloseTo(13.7563, 4);
    expect(Number(detail.body.currentLongitude)).toBeCloseTo(100.5018, 4);
  });

  it("opens late ETA exceptions and resolves them when the shipment is delivered", async () => {
    const shipment = await createInboundShipment();
    const pastEta = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await request(app.getHttpServer())
      .post(`/shipments/${shipment.id}/eta`)
      .set(auth())
      .send({ estimatedArrivalAt: pastEta, notes: "Carrier slipped" })
      .expect(201);

    const delayedList = await request(app.getHttpServer()).get("/shipments?delayed=true").set(auth()).expect(200);
    expect(delayedList.body.map((item: { id: string }) => item.id)).toContain(shipment.id);

    const openExceptions = await request(app.getHttpServer()).get(`/shipments/${shipment.id}/exceptions`).set(auth()).expect(200);
    expect(openExceptions.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "ETA_EXCEEDED", status: "OPEN", severity: expect.stringMatching(/WARNING|CRITICAL/) }),
      ]),
    );

    await request(app.getHttpServer()).post(`/shipments/${shipment.id}/book`).set(auth()).expect(201);
    await request(app.getHttpServer()).post(`/shipments/${shipment.id}/dispatch`).set(auth()).expect(201);
    await request(app.getHttpServer()).post(`/shipments/${shipment.id}/arrive`).set(auth()).expect(201);
    await request(app.getHttpServer()).post(`/shipments/${shipment.id}/deliver`).set(auth()).expect(201);

    const resolvedExceptions = await request(app.getHttpServer()).get(`/shipments/${shipment.id}/exceptions`).set(auth()).expect(200);
    expect(resolvedExceptions.body).toEqual(expect.arrayContaining([expect.objectContaining({ type: "ETA_EXCEEDED", status: "RESOLVED" })]));
  });

  it("prevents another tenant from reading or creating tracking records on the shipment", async () => {
    const shipment = await createInboundShipment();

    await request(app.getHttpServer()).get(`/shipments/${shipment.id}/events`).set(otherAuth()).expect(404);
    await request(app.getHttpServer())
      .post(`/shipments/${shipment.id}/events`)
      .set(otherAuth())
      .send({ eventType: "NOTE_ADDED", notes: "cross-tenant attempt" })
      .expect(404);
  });
});
