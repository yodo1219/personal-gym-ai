import type { WeightPoint } from "@/lib/weight";

export const CHART_WIDTH = 800;
export const CHART_HEIGHT = 450;

const PAD = { left: 84, right: 48, top: 56, bottom: 64 };
const LINE_COLOR = "#3b82f6";
const GRID_COLOR = "#e5e7eb";
const TEXT_COLOR = "#6b7280";

function dateToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function msToMD(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/**
 * 体重の推移グラフ（800x450）。日本語の文字は使わず、数字だけで描く
 * （画像生成の標準フォントに日本語が含まれないため）。
 * points は日付の古い順で、2件以上あること。
 */
export function buildWeightChart(points: WeightPoint[]) {
  const plotW = CHART_WIDTH - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;

  const weights = points.map((p) => p.weight);
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  const margin = Math.max((rawMax - rawMin) * 0.25, 0.5);
  // 目盛りがきりのいい値（0.5・1・2・5kg刻み）になるように範囲を決める
  const wantedRange = rawMax - rawMin + margin * 2;
  const step = [0.5, 1, 2, 5, 10].find((s) => wantedRange / s <= 5) ?? 10;
  const yMin = Math.floor((rawMin - margin) / step) * step;
  const yMax = Math.ceil((rawMax + margin) / step) * step;

  const t0 = dateToMs(points[0].date);
  const t1 = dateToMs(points[points.length - 1].date);
  const span = Math.max(t1 - t0, 86400000);

  const xOf = (dateStr: string) =>
    PAD.left + ((dateToMs(dateStr) - t0) / span) * plotW;
  const yOf = (w: number) =>
    PAD.top + (1 - (w - yMin) / (yMax - yMin)) * plotH;

  // 縦軸の目盛り
  const tickCount = Math.round((yMax - yMin) / step) + 1;
  const yTicks = Array.from({ length: tickCount }, (_, i) => yMin + step * i);

  // 横軸の日付（5か所）
  const xTicks = Array.from({ length: 5 }, (_, i) => t0 + (span * i) / 4);

  const coords = points.map((p) => ({ x: xOf(p.date), y: yOf(p.weight) }));
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const last = coords[coords.length - 1];
  const lastWeight = points[points.length - 1].weight;
  // 最新値のラベルは、点の上に置く。右端からはみ出さないよう位置を調整
  const labelWidth = 110;
  const labelLeft = Math.min(
    Math.max(last.x - labelWidth / 2, PAD.left),
    CHART_WIDTH - PAD.right - labelWidth + 20
  );

  return (
    <div
      style={{
        width: CHART_WIDTH,
        height: CHART_HEIGHT,
        display: "flex",
        position: "relative",
        background: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <svg
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {yTicks.map((v, i) => (
          <line
            key={i}
            x1={PAD.left}
            x2={CHART_WIDTH - PAD.right}
            y1={yOf(v)}
            y2={yOf(v)}
            stroke={GRID_COLOR}
            strokeWidth={1.5}
          />
        ))}
        <path d={linePath} fill="none" stroke={LINE_COLOR} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 8 : 5.5} fill="#ffffff" stroke={LINE_COLOR} strokeWidth={3.5} />
        ))}
      </svg>

      {yTicks.map((v, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 8,
            top: yOf(v) - 14,
            width: PAD.left - 22,
            display: "flex",
            justifyContent: "flex-end",
            fontSize: 22,
            color: TEXT_COLOR,
          }}
        >
          {v.toFixed(1)}
        </div>
      ))}

      {xTicks.map((t, i) => {
        const x = PAD.left + (plotW * i) / 4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - 40,
              top: CHART_HEIGHT - PAD.bottom + 16,
              width: 80,
              display: "flex",
              justifyContent: "center",
              fontSize: 22,
              color: TEXT_COLOR,
            }}
          >
            {msToMD(t)}
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: labelLeft,
          top: Math.max(last.y - 52, 6),
          width: labelWidth,
          display: "flex",
          justifyContent: "center",
          fontSize: 28,
          fontWeight: 700,
          color: "#111827",
        }}
      >
        {`${lastWeight}kg`}
      </div>
    </div>
  );
}
