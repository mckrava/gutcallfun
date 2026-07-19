import { EKG } from "@/state/constants";
import type { HistEntry } from "@/state/types";

// Ported verbatim from GutCallApp.buildEkg().
export function MatchEkg({ hist, t1 = "BRA", t2 = "ARG" }: { hist: HistEntry[]; t1?: string; t2?: string }) {
  const W = 316,
    H = 138,
    cy = H / 2,
    sc = cy - 14;
  const x = (m: number) => 4 + (m / 95) * (W - 8);
  const y = (t: number) => cy - t * sc;
  const pts = EKG.map((p) => x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1)).join(" ");

  return (
    <svg viewBox={"0 0 " + W + " " + H} width="100%" style={{ display: "block" }}>
      <line x1={4} y1={cy} x2={W - 4} y2={cy} stroke="rgba(255,255,255,.14)" strokeDasharray="3 4" />
      <text x={6} y={12} fill="#FFD84D" fontSize={8} fontWeight={700} letterSpacing={1} fontFamily="Barlow">
        {t1} PRESSURE
      </text>
      <text x={6} y={H - 5} fill="#7FB8E8" fontSize={8} fontWeight={700} letterSpacing={1} fontFamily="Barlow">
        {t2} PRESSURE
      </text>
      <text x={x(45) - 6} y={cy - 7} fill="rgba(255,255,255,.4)" fontSize={8} fontFamily="Barlow">
        HT
      </text>
      <polyline
        points={pts}
        fill="none"
        stroke="rgba(140,180,255,.25)"
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: "blur(4px)" }}
      />
      <polyline points={pts} fill="none" stroke="#BFD6F5" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(12.6)} cy={y(1)} r={4.5} fill="#FFD84D" stroke="#0A1120" strokeWidth={1.5} />
      <circle cx={x(58)} cy={y(-1)} r={4.5} fill="#7FB8E8" stroke="#0A1120" strokeWidth={1.5} />
      {hist.map((h, i) => {
        const good = h.earned > 0;
        return (
          <g key={i}>
            <circle cx={x(h.min)} cy={y(h.my)} r={3.4} fill={good ? "#3DDC84" : "#FF4D5E"} stroke="#0A1120" strokeWidth={1.2} />
            {good && (
              <text
                x={x(h.min) + (h.min > 80 ? -26 : 7)}
                y={y(h.my) + (h.my > 0 ? 15 : -9)}
                fill="#3DDC84"
                fontSize={9.5}
                fontWeight={700}
                fontFamily="Barlow"
              >
                {"+" + h.earned}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
