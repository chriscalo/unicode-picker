import { exportArcSystem } from "../design/palette.js";

const c = exportArcSystem({
  space: "oklch",
  hueCount: 24,
  arcs: 11,
  N: 11,
  curves: { tint: 0, shade: 0, pure: 0, magnitude: 2 },
});

console.log("META:");
console.log(JSON.stringify(c.meta, null, 2));
console.log("");
console.log("STOPS (first 20 keys + last 5):");
const keys = Object.keys(c.stops);
console.log("total:", keys.length);
for (const k of keys.slice(0, 20)) {
  console.log(`  "${k}": "${c.stops[k]}"`);
}
console.log("  ...");
for (const k of keys.slice(-5)) {
  console.log(`  "${k}": "${c.stops[k]}"`);
}
console.log("");
console.log("A few specific lookups across hues:");
for (const hue of ["h000", "h060", "h120", "h180", "h240", "h300"]) {
  for (const suffix of ["c50-50", "c100-50"]) {
    console.log(`  ${hue} ${suffix} → ${c.stops[`${hue} ${suffix}`]}`);
  }
}

// Compare to CSS oklch() for the same coordinates.
import { exportArcSystem as _e } from "../design/palette.js";
const internals = await import("../design/palette.js");
console.log("");
console.log("Cusp inspection — what is OKLCH_CUSP saying?");
// Roundabout way: render at c=1 (pure-color corner) at h180 and h0.
// At c=1, L = 0 + 1*Lp = Lp; C = 1*Cp = Cp. So this stops table entry IS the cusp.
// Skip — instead, look at the tonalgrid stops for hue 180, k=N, i=0 which is
// exactly that pure-color corner.
import { exportGridSystem } from "../design/palette.js";
const g = exportGridSystem({ space: "oklch", hueCount: 24, N: 10, scheme: "cl",
  curves: { tint: 0, shade: 0, pure: 0, magnitude: 2 } });
console.log("  h000 c100-l00 (pure red corner):", g.stops["h000 c100-l00"]);
console.log("  h180 c100-l00 (pure teal corner):", g.stops["h180 c100-l00"]);
console.log("  h120 c100-l00 (pure green corner):", g.stops["h120 c100-l00"]);
