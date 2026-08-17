/**
 * Tile geometry for the preview grid.
 *
 * The tile has one size, `tileMax`, and only ever shrinks below it when the
 * column is too narrow to hold even one — which is what makes a phone adapt
 * without making a laptop absurd. Everything else is column arithmetic: fit as
 * many tiles as the width allows, let the rest wrap.
 *
 * It is worth saying what this replaced, because both mistakes are easy to make
 * again. First, `auto-fill` with a viewport-derived minimum, which jumped the
 * tiles *smaller* every time another column happened to fit — widening the
 * middle panel from 568px to 657px took each tile from 239px down to 187px.
 * Then a version that grew the squares to fill the panel's height: monotonic
 * and full, but it produced 288px slabs on a wide screen, which is far more
 * symbol than anyone needs to recognise one. A fixed edge is the right answer;
 * the panel is for fitting more symbols on screen, not bigger ones.
 *
 * This lives in its own module so the properties that matter can be tested
 * directly.
 */

export type TilePlan = { columns: number; size: number };

/** The tile edge. Never exceeded; only undershot when a column is too narrow. */
export const tileMax = 125;
/** Floor for the undershoot, below which a square stops being readable. */
export const tileMin = 92;
/** Below this a square is cramped enough that the compact rows read better. */
export const tileRowsBelow = 300;

/**
 * Half a pixel of slack per line. Dividing the width exactly makes `columns`
 * tiles plus their gaps come to precisely the container width, and the
 * browser's sub-pixel rounding then wraps the last tile onto a line of its own
 * — three results once became a single scrolling column that way.
 */
const slack = 0.5;

/**
 * A phone's list width is not a panel width: no handle can change it, so the
 * monotonicity `planTiles` protects — widen the column, never shrink the tile —
 * has nothing to protect there. What a fixed square buys instead is a pair of
 * margins: at 390px the grid came to 257px of tiles floating in a 360px column
 * while every other control in the panel ran edge to edge.
 *
 * So below this width the tiles take the whole row. The column count still
 * comes from `planTiles`, which is what keeps this from being the `auto-fill`
 * mistake again — nothing here can add a column, only fill the one it is given.
 */
export const tileFillBelow = 460;
/** One result must not become a single enormous slab. */
export const tileFillMax = 208;

export function fillRow(plan: TilePlan, width: number, gap: number): TilePlan {
  if (width <= tileRowsBelow || width >= tileFillBelow) return plan;

  // The ceiling ramps from tileMax at the threshold up to tileFillMax, so the
  // threshold is not a step: one pixel narrower buys one pixel of tile, not a
  // quarter of one. A hard ceiling here would have swung the tile from 125 to
  // 149 across a single pixel of window.
  const ceiling = Math.min(tileFillMax, tileMax + (tileFillBelow - width) * 0.55);
  const byWidth = (width - gap * (plan.columns - 1) - slack) / plan.columns;
  const size = Math.floor(Math.min(ceiling, byWidth) * 100) / 100;

  return size > plan.size ? { columns: plan.columns, size } : plan;
}

export function planTiles(count: number, width: number, gap: number): TilePlan {
  if (count <= 0 || width <= 0) return { columns: 1, size: tileMax };
  if (width <= tileRowsBelow) return { columns: 1, size: Math.max(tileMin, Math.min(width, tileMax)) };

  const columns = Math.max(1, Math.min(count, Math.floor((width - slack + gap) / (tileMax + gap))));
  const byWidth = (width - gap * (columns - 1) - slack) / columns;
  const size = Math.floor(Math.min(tileMax, byWidth) * 100) / 100;

  return { columns, size: Math.max(tileMin, size) };
}
