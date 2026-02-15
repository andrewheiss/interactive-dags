// Helper functions for drawing DAGs
// -----------------------------------

// Standard colors
export const colorX = "#9b332b";
export const colorY = "#262d42";
export const colorZ = "#d39a2d";
export const colorZ0 = "#6b7c3f";
export const apparentLine = "#b64f32";

// Add some padding around the lines between nodes
export function shortenLine(x1, y1, x2, y2, padStart, padEnd) {
  if (padEnd === undefined) padEnd = padStart;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    x1: x1 + dx * (padStart / len),
    y1: y1 + dy * (padStart / len),
    x2: x2 - dx * (padEnd / len),
    y2: y2 - dy * (padEnd / len)
  };
}

// Add arrowhead markers to an SVG defs element
export function addArrowMarkers(defs) {
  for (const [id, fill] of [
    ["arrow-active", "#666"],
    ["arrow-blocked", "#ccc"]
  ]) {
    defs.append("marker")
      .attr("id", id)
      .attr("viewBox", "0 0 12 12")
      .attr("refX", 0)
      .attr("refY", 6)
      .attr("markerWidth", 18)
      .attr("markerHeight", 18)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M 0 0 L 12 6 L 0 12 z")
      .attr("fill", fill);
  }
}

// Add a circular clip path
export function addCircleClip(defs, id, cx, cy, r) {
  defs.append("clipPath")
    .attr("id", id)
    .append("circle")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", r);
}

// Create a diagonal hatch pattern
// Confounding: gold bg + red stripes (mostly Z, contaminated by X)
// Mediation: red bg + gold stripes (mostly X, contaminated by Z)
export function addHatchPattern(defs, id, bgColor, stripeColor, rotation) {
  const hatch = defs.append("pattern")
    .attr("id", id)
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6)
    .attr("patternTransform", `rotate(${rotation})`);

  hatch.append("rect")
    .attr("width", 6).attr("height", 6)
    .attr("fill", bgColor);

  hatch.append("line")
    .attr("x1", 0).attr("y1", 0)
    .attr("x2", 0).attr("y2", 6)
    .attr("stroke", stripeColor)
    .attr("stroke-width", 2.5);
}

// Draw an arrow between two points
export function drawEdge(svg, edge, nodeRadius) {
  if (edge.strength === 0) return;
  const arrowLen = 18;
  const gap = 6;
  const line = shortenLine(
    edge.from.x, edge.from.y,
    edge.to.x, edge.to.y,
    nodeRadius + gap,
    nodeRadius + gap + arrowLen
  );
  const strokeWidth = 2 + edge.strength * 5;

  svg.append("line")
    .attr("x1", line.x1).attr("y1", line.y1)
    .attr("x2", line.x2).attr("y2", line.y2)
    .attr("stroke", edge.blocked ? "#ccc" : "#666")
    .attr("stroke-width", strokeWidth)
    .attr("stroke-dasharray", edge.blocked ? "8 6" : "none")
    .attr("marker-end",
      `url(#arrow-${edge.blocked ? "blocked" : "active"})`
    )
    .attr("opacity", edge.blocked ? 0.4 : 0.85);

  if (edge.blocked) {
    const midX = (line.x1 + line.x2) / 2;
    const midY = (line.y1 + line.y2) / 2;
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const px = -dy / len;
    const py = dx / len;
    const barLen = 20;

    svg.append("line")
      .attr("x1", midX - px * barLen)
      .attr("y1", midY - py * barLen)
      .attr("x2", midX + px * barLen)
      .attr("y2", midY + py * barLen)
      .attr("stroke", "#E74C3C")
      .attr("stroke-width", 3.5)
      .attr("stroke-linecap", "round");
  }
}

// Area-proportional circle fills
// ------------------------------------------------------
// For a circle of radius r, compute the fraction of area
// filled from one edge inward by distance h (0 to 2r).
function areaFraction(h, r) {
  if (h <= 0) return 0;
  if (h >= 2 * r) return 1;
  const u = h / r - 1;
  return 0.5 + (Math.asin(u) + u * Math.sqrt(1 - u * u))
    / Math.PI;
}

// Inverse: given a target area fraction (0–1), find the
// distance from the edge that fills that fraction.
function areaToHeight(frac, r) {
  if (frac <= 0) return 0;
  if (frac >= 1) return 2 * r;
  let lo = 0, hi = 2 * r;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (areaFraction(mid, r) < frac) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Draw a node with stacked color bands inside a circle.
// Props are area fractions (not height fractions).
// bands: { bottomUp: [{prop, fill}], topDown: [{prop, fill}] }
// orientation: "vertical" (default) or "horizontal"
//   vertical:   bottomUp = bottom edge up, topDown = top edge down
//   horizontal: bottomUp = left edge right, topDown = right edge left
export function drawNode(
  svg, cx, cy, nodeRadius, clipId, bands, orientation, baseColor
) {
  const r = nodeRadius;
  const diam = r * 2;
  const horiz = orientation === "horizontal";

  const group = svg.append("g")
    .attr("clip-path", `url(#${clipId})`);

  // Base fill (node's own color, or gray fallback)
  group.append("rect")
    .attr("x", cx - r).attr("y", cy - r)
    .attr("width", diam).attr("height", diam)
    .attr("fill", baseColor || "#bbb");

  // Primary bands (bottom-up or left-to-right)
  let cumFrac = 0, prev = 0;
  for (const band of (bands.bottomUp || [])) {
    if (band.prop > 0.001) {
      cumFrac += band.prop;
      const extent = areaToHeight(Math.min(cumFrac, 1), r);
      const size = extent - prev;
      if (size > 0.5) {
        if (horiz) {
          group.append("rect")
            .attr("x", cx - r + prev).attr("y", cy - r)
            .attr("width", size).attr("height", diam)
            .attr("fill", band.fill);
        } else {
          group.append("rect")
            .attr("x", cx - r).attr("y", cy + r - extent)
            .attr("width", diam).attr("height", size)
            .attr("fill", band.fill);
        }
      }
      prev = extent;
    }
  }

  // Secondary bands (top-down or right-to-left)
  cumFrac = 0; prev = 0;
  for (const band of (bands.topDown || [])) {
    if (band.prop > 0.001) {
      cumFrac += band.prop;
      const extent = areaToHeight(Math.min(cumFrac, 1), r);
      const size = extent - prev;
      if (size > 0.5) {
        if (horiz) {
          group.append("rect")
            .attr("x", cx + r - extent).attr("y", cy - r)
            .attr("width", size).attr("height", diam)
            .attr("fill", band.fill);
        } else {
          group.append("rect")
            .attr("x", cx - r).attr("y", cy - r + prev)
            .attr("width", diam).attr("height", size)
            .attr("fill", band.fill);
        }
      }
      prev = extent;
    }
  }

  // Outline
  svg.append("circle")
    .attr("cx", cx).attr("cy", cy)
    .attr("r", r)
    .attr("fill", "none")
    .attr("stroke", "#333")
    .attr("stroke-width", 2);
}

// Draw a solid-fill node (no stacking)
export function drawSolidNode(svg, cx, cy, nodeRadius, color, opacity) {
  svg.append("circle")
    .attr("cx", cx).attr("cy", cy)
    .attr("r", nodeRadius)
    .attr("fill", color)
    .attr("stroke", "#333")
    .attr("stroke-width", 2)
    .attr("opacity", opacity ?? 1);
}

// Draw a text label centered on a node
export function drawLabel(svg, x, y, label) {
  svg.append("text")
    .attr("x", x).attr("y", y)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("fill", "white")
    .attr("font-size", "22px")
    .attr("font-weight", "bold")
    .text(label);
}
