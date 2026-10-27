import { assertBattery, choiceQ, noulQ, scoreQ, type Battery } from "./spec.js";

/** Stretch, spread, and inventory judgments. Code decides whether the spread is worth taking. */
export const houseBattery: Battery = {
  bot: "house",
  questions: [
    choiceQ("stretch", "Where does the latest price sit relative to `ret`?", {
      stretched_up: "Price has run up across the windows and sits extended above them.",
      stretched_down: "Price has run down across the windows and sits extended below them.",
      inside_range: "Price sits inside the span of the three windows.",
      other: "Price is not clearly stretched up, stretched down, or inside that span.",
    }),
    noulQ(
      "stretch_named",
      "Does the latest price sit clearly stretched up, stretched down, or inside the span of `ret`?",
      "One of those three placements is visible.",
      "None of those three placements is visible.",
    ),
    noulQ(
      "two_sided",
      "Is the book two-sided on `imbalance`?",
      "Neither side dominates.",
      "One side dominates.",
    ),
    noulQ(
      "spread_pays",
      "Is `spread_bps` wide next to `realized_vol`?",
      "The spread is wide beside recent realized vol.",
      "The spread is tight beside recent realized vol.",
    ),
    scoreQ("inventory_pressure", "How hard is `inventory` pressing, read with `drawdown`?", [
      "Inventory is flat and drawdown is quiet.",
      "Inventory is a light lean and drawdown is shallow.",
      "Inventory is a heavy lean and drawdown is still shallow.",
      "Drawdown is deep while inventory is open.",
    ]),
  ],
};

assertBattery(houseBattery);
