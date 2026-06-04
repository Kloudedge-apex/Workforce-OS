import React from "react";

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
}

export function SparklineChart({ data, width = 80, height = 24 }: SparklineChartProps) {
  const max = Math.max(...data, 1);
  const barWidth = width / data.length - 2;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {data.map((val, i) => {
        const h = (val / max) * height;
        return (
          <rect
            key={i}
            x={i * (barWidth + 2)}
            y={height - h}
            width={barWidth}
            height={h}
            fill="currentColor"
            className="text-rust-500 opacity-40 hover:opacity-100 transition-opacity"
            rx={1}
          />
        );
      })}
    </svg>
  );
}
