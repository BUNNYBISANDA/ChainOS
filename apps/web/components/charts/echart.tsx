"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([LineChart, BarChart, GridComponent, TitleComponent, TooltipComponent, LegendComponent, DatasetComponent, CanvasRenderer]);

/**
 * Thin ECharts wrapper (same hand-rolled pattern as shipment-map.tsx for
 * maplibre-gl) — one shared instance-lifecycle/resize concern, so each
 * chart component only has to describe its `option`.
 */
export function EChart({ option, height = 280, ariaLabel }: { option: EChartsOption; height?: number; ariaLabel: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = echarts.init(containerRef.current);
    instanceRef.current = instance;

    const resize = () => instance.resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      instance.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    instanceRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} role="img" aria-label={ariaLabel} style={{ height }} className="w-full" />;
}
