import type { CSSProperties } from "react";
import BR from "@/icons/fiats/BR.svg";
import AR from "@/icons/fiats/AR.svg";
import CO from "@/icons/fiats/CO.svg";
import MA from "@/icons/fiats/MA.svg";
import FR from "@/icons/fiats/FR.svg";
import NL from "@/icons/fiats/NL.svg";
import DE from "@/icons/fiats/DE.svg";

// Real flag assets from src/icons/fiats (named by ISO 3166-1 alpha-2), keyed by
// the app's country codes. Everything with an asset is served from here; only
// England (no distinct asset — GB is the UK flag) and Croatia (no HR asset yet)
// fall back to the inline SVGs below.
const FIAT_SRC: Record<string, string> = {
  BRA: BR.src,
  ARG: AR.src,
  COL: CO.src,
  MAR: MA.src,
  FRA: FR.src,
  NED: NL.src,
  GER: DE.src,
};

const FLAGS: Record<string, string> = {
  ENG: '<rect width="100" height="100" fill="#fff"/><rect x="40" width="20" height="100" fill="#CF142B"/><rect y="40" width="100" height="20" fill="#CF142B"/>',
  CRO: '<rect width="100" height="33.4" fill="#FF0000"/><rect y="33.4" width="100" height="33.2" fill="#fff"/><rect y="66.6" width="100" height="33.4" fill="#171796"/>',
};

function flagSVG(code: string): string {
  const inner = FLAGS[code] || '<rect width="100" height="100" fill="#1B2740"/>';
  const wrapped =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#c)">' +
    inner +
    "</g></svg>";
  return "data:image/svg+xml," + encodeURIComponent(wrapped);
}

const KNOWN = ["ENG", "CRO"];

export function Flag({ code, size, ring }: { code: string; size: number; ring?: string }) {
  const imgStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)",
    display: "block",
    objectFit: "cover",
  };

  const fiat = FIAT_SRC[code];
  if (fiat) return <img src={fiat} alt="" style={imgStyle} />;
  if (KNOWN.includes(code)) return <img src={flagSVG(code)} alt="" style={imgStyle} />;

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
    <div style={box}>
      <span style={q}>?</span>
    </div>
  );
}
