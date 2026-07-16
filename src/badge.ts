import type { Grade } from "./types.js";

const GRADE_COLOR: Record<Grade, string> = {
  A: "#2ea44f",
  B: "#94b81c",
  C: "#d4a017",
  D: "#d97706",
  F: "#c0392b",
};

/** Generates a shields.io-style SVG badge locally -- no network call, no image library. */
export function renderBadge(
  label: string,
  grade: Grade,
  slopIndex: number,
): string {
  const value = `${grade} (${slopIndex})`;
  const color = GRADE_COLOR[grade];
  const labelWidth = 6 + label.length * 6.5;
  const valueWidth = 6 + value.length * 7;
  const totalWidth = Math.round(labelWidth + valueWidth);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}
