import { Test } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SalesOrdersService } from "./sales-orders.service";
import { InventoryService } from "../inventory/inventory.service";
import { TenantContext } from "../../common/tenant/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { AppException } from "../../common/errors/app-exception";
import { AppErrorCode } from "../../common/errors/app-error-code";

jest.mock("@chainos/database", () => ({
  SalesOrderStatus: {
    DRAFT: "DRAFT",
    CONFIRMED: "CONFIRMED",
    ALLOCATED: "ALLOCATED",
    PARTIALLY_FULFILLED: "PARTIALLY_FULFILLED",
    FULFILLED: "FULFILLED",
    CANCELLED: "CANCELLED",
  },
  withTenant: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withTenant } = require("@chainos/database");

interface FakeSoLine {
  id: string;
  productId: string;
  qtyOrdered: number;
  qtyReserved: number;
  qtyFulfilled: number;
}

interface FakeSo {
  id: string;
  tenantId: string;
  status: string;
  orderNumber: string;
  warehouseId: string;
  confirmedByUserId?: string | null;
  confirmedAt?: Date | null;
  cancelledAt?: Date | null;
  lines: FakeSoLine[];
}

function fakeTxFor(so: FakeSo) {
  return {
    salesOrder: {
      findFirst: jest.fn(async () => ({ ...so, lines: so.lines })),
      update: jest.fn(async ({ data }: { data: Partial<FakeSo> }) => {
        Object.assign(so, data);
        return { ...so };
      }),
    },
    salesOrderLine: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; qtyReserved: { gte: number } };
          data: { qtyReserved: { decrement: number }; qtyFulfilled: { increment: number } };
        }) => {
          const line = so.lines.find((l) => l.id === where.id);
          if (!line || line.qtyReserved < where.qtyReserved.gte) return { count: 0 };
          line.qtyReserved -= data.qtyReserved.decrement;
          line.qtyFulfilled += data.qtyFulfilled.increment;
          return { count: 1 };
        },
      ),
      findMany: jest.fn(async () => so.lines),
    },
    auditLog: { create: jest.fn(async () => ({ id: "audit-1" })) },
  };
}

describe("SalesOrdersService", () => {
  let service: SalesOrdersService;
  let tenantContext: TenantContext;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesOrdersService,
        TenantContext,
        EventEmitter2,
        AuditService,
        {
          provide: InventoryService,
          useValue: { reserveForSalesOrder: jest.fn(), releaseReservationsForSalesOrder: jest.fn(), emitStockChanged: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(SalesOrdersService);
    tenantContext = moduleRef.get(TenantContext);
    jest.spyOn(moduleRef.get(EventEmitter2), "emitAsync").mockResolvedValue([]);
  });

  async function runAs<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ tenantId: "tenant-1", userId: "u1", permissions: [] }, fn);
  }

  describe("confirm()", () => {
    it("moves a DRAFT sales order to CONFIRMED and stamps confirmedBy/At", async () => {
      const so: FakeSo = { id: "so-1", tenantId: "tenant-1", status: "DRAFT", orderNumber: "SO-TEST-1", warehouseId: "wh-1", lines: [] };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(so)));

      const result = await runAs(() => service.confirm("so-1"));

      expect(result.status).toBe("CONFIRMED");
      expect(result.confirmedByUserId).toBe("u1");
      expect(result.confirmedAt).toBeInstanceOf(Date);
    });

    it("rejects re-confirming an already-CONFIRMED sales order", async () => {
      const so: FakeSo = { id: "so-1", tenantId: "tenant-1", status: "CONFIRMED", orderNumber: "SO-TEST-1", warehouseId: "wh-1", lines: [] };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(so)));

      await runAs(() =>
        expect(service.confirm("so-1")).rejects.toMatchObject({ code: AppErrorCode.SALES_ORDER_INVALID_TRANSITION }),
      );
    });
  });

  describe("cancel()", () => {
    it("rejects cancelling an already-FULFILLED sales order (terminal state)", async () => {
      const so: FakeSo = { id: "so-1", tenantId: "tenant-1", status: "FULFILLED", orderNumber: "SO-TEST-1", warehouseId: "wh-1", lines: [] };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(so)));

      await runAs(() =>
        expect(service.cancel("so-1")).rejects.toMatchObject({ code: AppErrorCode.SALES_ORDER_INVALID_TRANSITION }),
      );
    });
  });

  describe("fulfill() status guard", () => {
    it("rejects fulfilling a DRAFT sales order (never allocated)", async () => {
      const so: FakeSo = {
        id: "so-1",
        tenantId: "tenant-1",
        status: "DRAFT",
        orderNumber: "SO-TEST-1",
        warehouseId: "wh-1",
        lines: [{ id: "line-1", productId: "prod-1", qtyOrdered: 100, qtyReserved: 0, qtyFulfilled: 0 }],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(so)));

      await runAs(async () => {
        let caught: unknown;
        try {
          await service.fulfill("so-1", { lines: [{ salesOrderLineId: "line-1", qty: 10 }] });
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(AppException);
        expect((caught as AppException).code).toBe(AppErrorCode.SALES_ORDER_INVALID_STATUS);
      });
    });

    it("rejects fulfilling a CANCELLED sales order", async () => {
      const so: FakeSo = {
        id: "so-1",
        tenantId: "tenant-1",
        status: "CANCELLED",
        orderNumber: "SO-TEST-1",
        warehouseId: "wh-1",
        lines: [{ id: "line-1", productId: "prod-1", qtyOrdered: 100, qtyReserved: 0, qtyFulfilled: 0 }],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(so)));

      await runAs(() =>
        expect(service.fulfill("so-1", { lines: [{ salesOrderLineId: "line-1", qty: 10 }] })).rejects.toMatchObject({
          code: AppErrorCode.SALES_ORDER_INVALID_STATUS,
        }),
      );
    });

    it("rejects a fulfillment quantity greater than what remains reserved", async () => {
      const so: FakeSo = {
        id: "so-1",
        tenantId: "tenant-1",
        status: "ALLOCATED",
        orderNumber: "SO-TEST-1",
        warehouseId: "wh-1",
        lines: [{ id: "line-1", productId: "prod-1", qtyOrdered: 100, qtyReserved: 100, qtyFulfilled: 0 }],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(so)));

      await runAs(() =>
        expect(service.fulfill("so-1", { lines: [{ salesOrderLineId: "line-1", qty: 101 }] })).rejects.toMatchObject({
          code: AppErrorCode.SALES_ORDER_OVER_FULFILLMENT,
        }),
      );
    });

    it("rejects an unknown sales order line id", async () => {
      const so: FakeSo = {
        id: "so-1",
        tenantId: "tenant-1",
        status: "ALLOCATED",
        orderNumber: "SO-TEST-1",
        warehouseId: "wh-1",
        lines: [{ id: "line-1", productId: "prod-1", qtyOrdered: 100, qtyReserved: 100, qtyFulfilled: 0 }],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(so)));

      await runAs(() =>
        expect(service.fulfill("so-1", { lines: [{ salesOrderLineId: "line-does-not-exist", qty: 1 }] })).rejects.toMatchObject({
          code: AppErrorCode.SALES_ORDER_LINE_UNKNOWN,
        }),
      );
    });

    it("partial fulfillment moves the order to PARTIALLY_FULFILLED, full fulfillment moves it to FULFILLED", async () => {
      const so: FakeSo = {
        id: "so-1",
        tenantId: "tenant-1",
        status: "ALLOCATED",
        orderNumber: "SO-TEST-1",
        warehouseId: "wh-1",
        lines: [{ id: "line-1", productId: "prod-1", qtyOrdered: 100, qtyReserved: 100, qtyFulfilled: 0 }],
      };
      (withTenant as jest.Mock).mockImplementation(async (_tenantId: string, fn: (tx: unknown) => unknown) => fn(fakeTxFor(so)));

      await runAs(() => service.fulfill("so-1", { lines: [{ salesOrderLineId: "line-1", qty: 40 }] }));
      expect(so.status).toBe("PARTIALLY_FULFILLED");

      await runAs(() => service.fulfill("so-1", { lines: [{ salesOrderLineId: "line-1", qty: 60 }] }));
      expect(so.status).toBe("FULFILLED");
    });
  });
});
