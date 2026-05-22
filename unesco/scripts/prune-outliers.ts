/**
 * Remove geocode outliers within each product.
 *
 * Strategy: median lat/lng as robust centroid → drop any location > THRESHOLD_KM away.
 * Median (not mean) so a few outliers don't drag the centroid toward themselves.
 *
 * Run: cd unesco && npx tsx scripts/prune-outliers.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const THRESHOLD_KM = 3000;
const PATH = resolve(__dirname, "../data/hyecho-packages.json");

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface Loc { name: string; lat: number; lng: number }

const data: { id: string; title: string; locations: Loc[] }[] = JSON.parse(readFileSync(PATH, "utf-8"));
const pruned: { id: string; title: string; name: string; lat: number; lng: number; dist: number }[] = [];

for (const p of data) {
  if (!p.locations || p.locations.length < 2) continue;
  const mLat = median(p.locations.map((l) => l.lat));
  const mLng = median(p.locations.map((l) => l.lng));
  const kept: Loc[] = [];
  for (const loc of p.locations) {
    const d = haversine(loc.lat, loc.lng, mLat, mLng);
    if (d > THRESHOLD_KM) {
      pruned.push({ id: p.id, title: p.title, name: loc.name, lat: loc.lat, lng: loc.lng, dist: Math.round(d) });
    } else {
      kept.push(loc);
    }
  }
  p.locations = kept;
}

writeFileSync(PATH, JSON.stringify(data, null, 2));

console.log(`Pruned ${pruned.length} outlier locations (>${THRESHOLD_KM}km from median centroid):`);
for (const x of pruned) {
  console.log(`  [${x.dist}km] ${x.name} (${x.lat.toFixed(2)},${x.lng.toFixed(2)}) <- ${x.title}`);
}
console.log(`\nTotal packages: ${data.length}, packages with locations: ${data.filter((p) => p.locations.length > 0).length}`);
