"use client";

import type { InventoryMovementPoint, OtifTrendPoint, PoValueTrendPoint } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/format";
import { EChart } from "./echart";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart as LineChartIcon } from "lucide-react";

/** OTIF trend — line chart. Communicates whether on-time-in-full performance is improving or slipping over the selected period. */
export function OtifTrendChart({ points }: { points: OtifTrendPoint[] }) {
  if (points.length === 0) return <EmptyState icon={LineChartIcon} title="No delivered orders in this period" />;

  return (
    <EChart
      ariaLabel="Customer OTIF trend"
      option={{
        title: { text: "Customer OTIF trend", left: 0, textStyle: { fontSize: 13, fontWeight: 600 } },
        grid: { left: 48, right: 16, top: 48, bottom: 32 },
        tooltip: {
          trigger: "axis",
          formatter: (params) => {
            const items = Array.isArray(params) ? params : [params];
            const point = points[items[0].dataIndex as number];
            return `${point.bucket}<br/>OTIF: ${formatPercent(point.otifPercent)}<br/>${point.successful}/${point.eligible} eligible orders on time & in full`;
          },
        },
        xAxis: { type: "category", data: points.map((p) => p.bucket), axisLabel: { fontSize: 11 } },
        yAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%", fontSize: 11 } },
        series: [
          {
            type: "line",
            data: points.map((p) => p.otifPercent ?? null),
            connectNulls: false,
            smooth: false,
            itemStyle: { color: "#2563eb" },
            lineStyle: { width: 2 },
          },
        ],
      }}
    />
  );
}

/** PO value trend — bar chart, one bar per period bucket. Communicates procurement spend commitment over time. */
export function PoValueTrendChart({ points, currency = "THB" }: { points: PoValueTrendPoint[]; currency?: string }) {
  if (points.length === 0) return <EmptyState icon={LineChartIcon} title="No purchase orders in this period" />;

  return (
    <EChart
      ariaLabel="Purchase order value trend"
      option={{
        title: { text: "PO value trend", left: 0, textStyle: { fontSize: 13, fontWeight: 600 } },
        grid: { left: 64, right: 16, top: 48, bottom: 32 },
        tooltip: {
          trigger: "axis",
          formatter: (params) => {
            const items = Array.isArray(params) ? params : [params];
            const point = points[items[0].dataIndex as number];
            return `${point.bucket}<br/>${formatMoney(currency, point.value)}`;
          },
        },
        xAxis: { type: "category", data: points.map((p) => p.bucket), axisLabel: { fontSize: 11 } },
        yAxis: { type: "value", axisLabel: { formatter: (v: number) => formatMoney(currency, v), fontSize: 11 } },
        series: [{ type: "bar", data: points.map((p) => p.value), itemStyle: { color: "#0891b2" } }],
      }}
    />
  );
}

/** Inbound vs outbound physical inventory flow — grouped bar. Excludes reservations (spec §29): only actual ledger movement. */
export function InventoryFlowChart({ points }: { points: InventoryMovementPoint[] }) {
  if (points.length === 0) return <EmptyState icon={LineChartIcon} title="No inventory movement in this period" />;

  return (
    <EChart
      ariaLabel="Inbound vs outbound inventory flow"
      option={{
        title: { text: "Inventory flow (inbound vs outbound)", left: 0, textStyle: { fontSize: 13, fontWeight: 600 } },
        grid: { left: 48, right: 16, top: 56, bottom: 32 },
        legend: { top: 24, textStyle: { fontSize: 11 } },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: points.map((p) => p.bucket), axisLabel: { fontSize: 11 } },
        yAxis: { type: "value", axisLabel: { fontSize: 11 } },
        series: [
          { name: "Inbound", type: "bar", data: points.map((p) => p.inbound), itemStyle: { color: "#16a34a" } },
          { name: "Outbound", type: "bar", data: points.map((p) => p.outbound), itemStyle: { color: "#d97706" } },
        ],
      }}
    />
  );
}
