import type { Product, SalesOrder, StockLevel } from "@/lib/types";

export function salesOrderTotal(order: SalesOrder): number {
  return order.totalValue ?? order.lines.reduce((sum, line) => sum + line.qtyOrdered * Number(line.unitPrice ?? 0), 0);
}

export function lineProduct(line: SalesOrder["lines"][number], products: Product[]): Product | undefined {
  return line.product ?? products.find((p) => p.id === line.productId);
}

export function stockForLine(line: SalesOrder["lines"][number], order: SalesOrder, stockLevels: StockLevel[]): StockLevel | undefined {
  return stockLevels.find((s) => s.productId === line.productId && s.warehouseId === order.warehouseId);
}

export function availableQuantity(stock: StockLevel | undefined): number {
  if (!stock) return 0;
  return stock.quantityOnHand - stock.quantityReserved;
}
