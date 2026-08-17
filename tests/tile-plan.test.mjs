// The preview grid's geometry. The bug this file exists to prevent is the one
// the old `auto-fill` grid had: widening the panel made the tiles smaller.
import assert from "node:assert/strict";
import test from "node:test";

import { fillRow, planTiles, tileFillBelow, tileFillMax, tileMax, tileMin, tileRowsBelow } from "../app/tile-plan.ts";

const GAP = 7.8;

test("the tile is a fixed edge, never bigger, whenever one fits", () => {
  for (const count of [1, 2, 3, 5, 8, 12, 20]) {
    for (let width = tileRowsBelow + 1; width <= 1400; width += 3) {
      const { size } = planTiles(count, width, GAP);
      assert.equal(size, tileMax, `count=${count} width=${width} gave ${size}`);
    }
  }
});

test("a narrow column shrinks the tile instead of overflowing", () => {
  for (let width = 96; width <= tileRowsBelow; width += 4) {
    const { columns, size } = planTiles(4, width, GAP);
    assert.equal(columns, 1);
    assert.ok(size <= tileMax, `width=${width} gave ${size}`);
    assert.ok(size <= Math.max(width, tileMin), `width=${width} overflowed with ${size}`);
  }
});

test("a wider panel never produces a smaller tile", () => {
  for (const count of [1, 2, 3, 5, 8, 20]) {
    let previous = 0;
    for (let width = 96; width <= 1400; width += 3) {
      const { size } = planTiles(count, width, GAP);
      assert.ok(size >= previous - 0.01, `count=${count} width=${width}: ${previous} → ${size}`);
      previous = size;
    }
  }
});

test("a row of tiles always fits the width it was measured for", () => {
  for (const count of [1, 2, 3, 4, 5, 7, 9, 16]) {
    for (let width = tileRowsBelow + 1; width <= 1400; width += 7) {
      const { columns, size } = planTiles(count, width, GAP);
      const used = columns * size + GAP * (columns - 1);
      assert.ok(used <= width, `count=${count} width=${width}: row needs ${used}`);
    }
  }
});

test("the row uses every column the width can hold, up to the result count", () => {
  for (const count of [1, 2, 3, 6, 30]) {
    for (const width of [320, 480, 640, 900, 1400]) {
      const { columns, size } = planTiles(count, width, GAP);
      assert.ok(columns >= 1 && columns <= Math.max(1, count), `columns ${columns} out of range`);
      assert.ok(size >= tileMin, `size ${size} below the floor`);
      // One more tile must genuinely not have fitted.
      if (columns < count) {
        const withOneMore = (columns + 1) * tileMax + GAP * columns;
        assert.ok(withOneMore > width, `count=${count} width=${width}: ${columns + 1} columns would have fitted`);
      }
    }
  }
});

// fillRow is the phone half of the geometry: no drag handle can change a phone's
// list width, so the tiles take the row instead of floating in the middle of it.
test("a phone-width row is filled, and never overflows the width it was given", () => {
  for (const count of [1, 2, 3, 4, 6, 12]) {
    for (let width = tileRowsBelow + 1; width < tileFillBelow; width += 1) {
      const plan = planTiles(count, width, GAP);
      const filled = fillRow(plan, width, GAP);
      assert.equal(filled.columns, plan.columns, `width=${width} changed the column count`);
      assert.ok(filled.size >= plan.size, `width=${width}: ${plan.size} → ${filled.size}`);
      assert.ok(filled.size <= tileFillMax, `width=${width} gave ${filled.size}`);
      const used = filled.columns * filled.size + GAP * (filled.columns - 1);
      assert.ok(used <= width, `count=${count} width=${width}: row needs ${used}`);
    }
  }
});

test("crossing the fill threshold is a step of pixels, not of quarters", () => {
  const inside = fillRow(planTiles(6, tileFillBelow - 1, GAP), tileFillBelow - 1, GAP);
  const outside = fillRow(planTiles(6, tileFillBelow + 1, GAP), tileFillBelow + 1, GAP);
  assert.ok(Math.abs(inside.size - outside.size) <= 1.5, `${outside.size} → ${inside.size}`);
});

test("fillRow leaves a panel-width row and the compact rows alone", () => {
  for (const width of [tileFillBelow, 600, 900, 1400]) {
    const plan = planTiles(6, width, GAP);
    assert.deepEqual(fillRow(plan, width, GAP), plan, `width=${width} was filled`);
  }
  for (const width of [120, 240, tileRowsBelow]) {
    const plan = planTiles(6, width, GAP);
    assert.deepEqual(fillRow(plan, width, GAP), plan, `width=${width} was filled`);
  }
});

test("degenerate input does not throw", () => {
  assert.deepEqual(planTiles(0, 800, GAP), { columns: 1, size: tileMax });
  assert.deepEqual(planTiles(4, 0, GAP), { columns: 1, size: tileMax });
});
