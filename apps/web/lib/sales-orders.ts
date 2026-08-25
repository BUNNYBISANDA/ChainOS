import type { CustomerOrder, Product, StockLevel } from "@/lib/types";

export function salesOrderNumber(order: CustomerOrder): string {
  return order.soNumber ?? order.customerOrderNumber ?? order.orderNumber ?? `SO-${order.id.slice(0, 8)}`;
}

export function salesOrderStatus(order: CustomerOrder): string {
  if (order.status === "RESERVED") return "ALLOCATED";
  if (order.status === "READY_TO_SHIP") return "FULFILLED";
  if (order.status === "DELIVERED") return "FULFILLED";
  return order.status;
}

export function salesOrderTotal(order: CustomerOrder): number {
  return order.lines.reduce((sum, line) => sum + line.qtyOrdered * Number(line.unitPrice ?? 0), 0);
}

export function lineProduct(line: CustomerOrder["lines"][number], products: Product[]): Product | undefined {
  return line.product ?? products.find((p) => p.id === line.productId);
}

export function stockForLine(line: CustomerOrder["lines"][number], order: CustomerOrder, stockLevels: StockLevel[]): StockLevel | undefined {
  return stockLevels.find((s) => s.productId === line.productId && s.warehouseId === order.warehouseId);
}

export function availableQuantity(stock: StockLevel | undefined): number {
  if (!stock) return 0;
  return stock.quantityOnHand - stock.quantityReserved;
}
