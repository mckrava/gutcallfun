import type { CSSProperties } from "react";
import FIAT_FLAGS from "@/icons/fiats";
import { countryNameToAlpha2 } from "./country-codes";

// Renders a circular flag for a backend team/country NAME (game.team1_name etc.).
// Resolves name → ISO alpha-2 → the src/icons/fiats asset. Unknown names get the
// same dashed "?" placeholder the mock's Flag uses. This is the real-data
// counterpart to components/common/Flag (which is keyed by the mock's own codes).
export function CountryFlag({ name, size, ring }: { name: string | null | undefined; size: number; ring?: string }) {
  const alpha2 = countryNameToAlpha2(name);
  const src = alpha2 ? FIAT_FLAGS[alpha2] : undefined;

  const imgStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    boxShadow: ring ? `inset 0 0 0 1px rgba(255,255,255,.12), 0 0 0 2px ${ring}` : "inset 0 0 0 1px rgba(255,255,255,.12)",
    display: "block",
    objectFit: "cover",
  };

  if (src) return <img src={src} alt={name ?? ""} style={imgStyle} />;

  const box: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: "rgba(255,255,255,.03)",
    border: "2px dashed rgba(255,216,77,.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
  const q: CSSProperties = {
    fontFamily: "'Barlow Condensed',sans-serif",
    fontWeight: 700,
    fontSize: Math.round(size * 0.48),
    color: "rgba(255,216,77,.75)",
    lineHeight: 1,
  };
  return (
    <div style={box} title={name ?? ""}>
      <span style={q}>?</span>
    </div>
  );
}
