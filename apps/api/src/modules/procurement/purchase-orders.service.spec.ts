import { Test } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { TenantContext } from "../../common/tenant/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { AppException } from "../../common/errors/app-exception";
import { AppErrorCode } from "../../common/errors/app-error-code";

jest.mock("@chainos/database", () => ({
  PurchaseOrderStatus: {
    DRAFT: "DRAFT",
    APPROVED: "APPROVED",
    SHIPPED: "SHIPPED",
    PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
    RECEIVED: "RECEIVED",
    CANCELLED: "CANCELLED",
  },
  withTenant: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withTenant } = require("@chainos/database");

interface FakePoLine {
  id: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
}

interface FakePo {
  id: string;
  tenantId: string;
  status: string;
  poNumber: string;
  warehouseId: string;
  approvedByUserId?: string | null;
  approvedAt?: Date | null;
  lines: FakePoLine[];
}

function fakeTxFor(po: FakePo) {
  return {
    purchaseOrder: {
      findFirst: jest.fn(async () => ({ ...po })),
      update: jest.fn(async ({ data }: { data: Partial<FakePo> }) => {
        Object.assign(po, data);
        return { ...po };
      }),
    },
    purchaseOrderLine: {
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { qtyReceived: { increment: number } } }) => {
        const line = po.lines.find((l) => l.id === where.id)!;
        line.qtyReceived += data.qtyReceived.increment;
        return line;
      }),
      findMany: jest.fn(async () => po.lines),
    },
    goodsReceipt: { create: jest.fn(async () => ({ id: "gr-1" })) },
    goodsReceiptLine: { create: jest.fn(async ({ data }: { data: { productId: string } }) => ({ id: "grl-1", ...data })) },
    auditLog: { create: jest.fn(async () => ({ id: "audit-1" })) },
  };
}

describe("PurchaseOrdersService", () => {
  let service: PurchaseOrdersService;
  let tenantContext: TenantContext;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [PurchaseOrdersService, TenantContext, EventEmitter2, AuditService],
    }).compile();
    service = moduleRef.get(PurchaseOrdersService);
    tenantContext = moduleRef.get(TenantContext);
    jest.spyOn(moduleRef.get(EventEmitter2), "emitAsync").mockResolvedValue([]);
  });

  async function runAs<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ tenantId: "tenant-1", userId: "u1", permissions: [] }, fn);
  }

  describe("receive() status guard", () => {
    it("rejects receiving against a DRAFT purchase order", async () => {
      const po: FakePo = {
        id: "po-1",
        tenantId: "tenant-1",
        status: "DRAFT",
        poNumber: "PO-TEST-1",
        warehouseId: "wh-1",
        lines: [{ id: "line-1", productId: "prod-1", qtyOrdered: 100, qtyReceived: 0 }],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(po)));

      await runAs(async () => {
        let caught: unknown;
        try {
          await service.receive("po-1", { lines: [{ purchaseOrderLineId: "line-1", qtyReceived: 10 }] });
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(AppException);
        expect((caught as AppException).code).toBe(AppErrorCode.PURCHASE_ORDER_INVALID_STATUS);
      });
    });

    it("rejects DRAFT -> RECEIVED as an invalid jump (same guard, matches the DoD example)", async () => {
      const po: FakePo = {
        id: "po-1",
        tenantId: "tenant-1",
        status: "DRAFT",
        poNumber: "PO-TEST-1",
        warehouseId: "wh-1",
        lines: [{ id: "line-1", productId: "prod-1", qtyOrdered: 1000, qtyReceived: 0 }],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(po)));

      await runAs(async () => {
        await expect(
          service.receive("po-1", { lines: [{ purchaseOrderLineId: "line-1", qtyReceived: 1000 }] }),
        ).rejects.toMatchObject({ code: AppErrorCode.PURCHASE_ORDER_INVALID_STATUS });
      });
    });

    it("rejects a receipt that would exceed the ordered quantity", async () => {
      const po: FakePo = {
        id: "po-1",
        tenantId: "tenant-1",
        status: "SHIPPED",
        poNumber: "PO-TEST-1",
        warehouseId: "wh-1",
        lines: [{ id: "line-1", productId: "prod-1", qtyOrdered: 1000, qtyReceived: 0 }],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(po)));

      await runAs(async () => {
        await expect(
          service.receive("po-1", { lines: [{ purchaseOrderLineId: "line-1", qtyReceived: 1001 }] }),
        ).rejects.toMatchObject({ code: AppErrorCode.PURCHASE_ORDER_OVER_RECEIPT });
      });
    });
  });

  describe("approve()", () => {
    it("moves a DRAFT purchase order to APPROVED and stamps approvedBy/At", async () => {
      const po: FakePo = {
        id: "po-1",
        tenantId: "tenant-1",
        status: "DRAFT",
        poNumber: "PO-TEST-1",
        warehouseId: "wh-1",
        lines: [],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(po)));

      const result = await runAs(() => service.approve("po-1"));

      expect(result.status).toBe("APPROVED");
      expect(result.approvedByUserId).toBe("u1");
      expect(result.approvedAt).toBeInstanceOf(Date);
    });

    it("rejects approving an already-CANCELLED purchase order", async () => {
      const po: FakePo = {
        id: "po-1",
        tenantId: "tenant-1",
        status: "CANCELLED",
        poNumber: "PO-TEST-1",
        warehouseId: "wh-1",
        lines: [],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(po)));

      await runAs(() =>
        expect(service.approve("po-1")).rejects.toMatchObject({ code: AppErrorCode.PURCHASE_ORDER_INVALID_TRANSITION }),
      );
    });
  });
});
