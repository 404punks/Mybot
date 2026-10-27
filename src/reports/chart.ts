import type { Bucket } from "./calibration.js";

/** Reliability chart: predicted probability on x, realized rate on y. */
export function reliabilitySvg(buckets: readonly Bucket[]): string {
  const width = 640;
  const height = 420;
  const pad = 48;
  const plot = width - pad * 2;
  const x = (value: number) => pad + value * plot;
  const y = (value: number) => pad + (1 - value) * plot;
  const dots = buckets
    .filter((bucket) => bucket.count > 0 && bucket.meanPredicted !== null && bucket.actualRate !== null)
    .map((bucket) => {
      const radius = 4 + Math.min(10, bucket.count);
      return `<circle cx="${x(bucket.meanPredicted ?? 0).toFixed(1)}" cy="${y(bucket.actualRate ?? 0).toFixed(1)}" r="${radius}" fill="#1f4b99" />`;
    })
    .join("");
  const labels = [0, 0.5, 1]
    .map((tick) => {
      const pos = x(tick).toFixed(1);
      const yPos = y(tick).toFixed(1);
      return `<text x="${pos}" y="${height - 16}" text-anchor="middle" font-size="12">${tick}</text><text x="16" y="${yPos}" font-size="12">${tick}</text>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <line x1="${pad}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#b9b9b9" stroke-dasharray="4 4"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${y(0)}" stroke="#222"/>
  <line x1="${pad}" y1="${y(0)}" x2="${x(1)}" y2="${y(0)}" stroke="#222"/>
  ${dots}
  ${labels}
  <text x="${width / 2}" y="28" text-anchor="middle" font-size="16">Reliability</text>
  <text x="${width / 2}" y="${height - 2}" text-anchor="middle" font-size="12">Predicted probability</text>
</svg>`;
}
