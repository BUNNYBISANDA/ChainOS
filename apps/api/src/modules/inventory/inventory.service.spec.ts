import { Test } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InventoryService } from "./inventory.service";
import { PoReceivedPayload } from "../../common/events/domain-events";

jest.mock("@chainos/database", () => {
  class FakePrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    StockMovementType: { RECEIPT: "RECEIPT", FULFILLMENT: "FULFILLMENT", ADJUSTMENT: "ADJUSTMENT", TRANSFER: "TRANSFER" },
    Prisma: { PrismaClientKnownRequestError: FakePrismaClientKnownRequestError },
    withTenant: jest.fn(),
    __FakePrismaClientKnownRequestError: FakePrismaClientKnownRequestError,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withTenant, __FakePrismaClientKnownRequestError: FakePrismaClientKnownRequestError } = require("@chainos/database");

interface StockLevelRow {
  id: string;
  quantityOnHand: number;
  quantityReserved: number;
}

/**
 * In-memory stand-in for the Prisma transaction client, just enough of the
 * surface InventoryService touches. `processedEvent.create` reproduces the
 * real unique-constraint behavior (P2002 on a duplicate tenantId+eventId)
 * that the idempotency guard depends on.
 */
function createFakeTx() {
  const claimed = new Set<string>();
  const levels = new Map<string, StockLevelRow>();
  const movements: Array<Record<string, unknown>> = [];

  const key = (productId: string, warehouseId: string) => `${productId}:${warehouseId}`;

  return {
    processedEvent: {
      create: jest.fn(async ({ data }: { data: { tenantId: string; eventId: string } }) => {
        const claimKey = `${data.tenantId}:${data.eventId}`;
        if (claimed.has(claimKey)) {
          throw new FakePrismaClientKnownRequestError("Unique constraint failed on the fields: (`tenantId`,`eventId`)", "P2002");
        }
        claimed.add(claimKey);
        return { id: `pe-${claimed.size}`, ...data };
      }),
    },
    stockMovement: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        movements.push(data);
        return { id: `mv-${movements.length}`, ...data };
      }),
    },
    stockLevel: {
      findFirst: jest.fn(async ({ where }: { where: { productId: string; warehouseId: string } }) => {
        const existing = levels.get(key(where.productId, where.warehouseId));
        return existing ? { ...existing } : null;
      }),
      findFirstOrThrow: jest.fn(async ({ where }: { where: { productId: string; warehouseId: string } }) => {
        const existing = levels.get(key(where.productId, where.warehouseId));
        if (!existing) throw new Error("No StockLevel found");
        return { ...existing };
      }),
      create: jest.fn(
        async ({
          data,
        }: {
          data: { productId: string; warehouseId: string; quantityOnHand?: number; quantityReserved?: number };
        }) => {
          const k = key(data.productId, data.warehouseId);
          const row: StockLevelRow = {
            id: `sl-${levels.size + 1}`,
            quantityOnHand: data.quantityOnHand ?? 0,
            quantityReserved: data.quantityReserved ?? 0,
          };
          levels.set(k, row);
          return { ...row };
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { quantityOnHand?: { increment: number }; quantityReserved?: { increment?: number; decrement?: number } };
        }) => {
          const entry = [...levels.entries()].find(([, v]) => v.id === where.id);
          if (!entry) throw new Error("StockLevel not found for update");
          const [k, existing] = entry;
          const next: StockLevelRow = { ...existing };
          if (data.quantityOnHand?.increment !== undefined) next.quantityOnHand += data.quantityOnHand.increment;
          if (data.quantityReserved?.increment !== undefined) next.quantityReserved += data.quantityReserved.increment;
          if (data.quantityReserved?.decrement !== undefined) next.quantityReserved -= data.quantityReserved.decrement;
          levels.set(k, next);
          return { ...next };
        },
      ),
    },
    __levels: levels,
    __movements: movements,
  };
}

describe("InventoryService idempotency (po.received)", () => {
  let service: InventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [InventoryService, EventEmitter2],
    }).compile();
    service = moduleRef.get(InventoryService);
    jest.spyOn(moduleRef.get(EventEmitter2), "emitAsync").mockResolvedValue([]);
  });

  it("applies a receipt exactly once even if the same event is delivered twice", async () => {
    const tx = createFakeTx();
    (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(tx));

    const payload: PoReceivedPayload = {
      eventId: "evt-fixed-id",
      tenantId: "tenant-1",
      purchaseOrderId: "po-1",
      warehouseId: "wh-1",
      receiptId: "receipt-1",
      receivedAt: new Date().toISOString(),
      lines: [{ purchaseOrderLineId: "line-1", goodsReceiptLineId: "grl-1", productId: "prod-1", qtyReceived: 1000 }],
    };

    await service.handlePoReceived(payload);
    await service.handlePoReceived(payload); // duplicate redelivery of the SAME event

    expect(tx.__levels.get("prod-1:wh-1")?.quantityOnHand).toBe(1000);
    expect(tx.__movements).toHaveLength(1);
  });

  it("applies two DIFFERENT events independently (+1000 then +500 = 1500)", async () => {
    const tx = createFakeTx();
    (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(tx));

    await service.handlePoReceived({
      eventId: "evt-a",
      tenantId: "tenant-1",
      purchaseOrderId: "po-1",
      warehouseId: "wh-1",
      receiptId: "receipt-a",
      receivedAt: new Date().toISOString(),
      lines: [{ purchaseOrderLineId: "line-1", goodsReceiptLineId: "grl-a", productId: "prod-1", qtyReceived: 1000 }],
    });
    await service.handlePoReceived({
      eventId: "evt-b",
      tenantId: "tenant-1",
      purchaseOrderId: "po-1",
      warehouseId: "wh-1",
      receiptId: "receipt-b",
      receivedAt: new Date().toISOString(),
      lines: [{ purchaseOrderLineId: "line-1", goodsReceiptLineId: "grl-b", productId: "prod-1", qtyReceived: 500 }],
    });

    expect(tx.__levels.get("prod-1:wh-1")?.quantityOnHand).toBe(1500);
    expect(tx.__movements).toHaveLength(2);
  });
});
