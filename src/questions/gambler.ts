import { assertBattery, choiceQ, noulQ, type Battery } from "./spec.js";

/** Chase and tape-shape judgments. The desk decides whether they are worth a trade. */
export const gamblerBattery: Battery = {
  bot: "gambler",
  questions: [
    choiceQ("tape_shape", "Which shape do the three windows in `ret` show?", {
      continuation: "The short, medium, and long windows point the same way.",
      snap_back: "The short window points against the medium and long windows.",
      stall: "The short window is flat beside the medium and long windows.",
      other: "The three windows do not show continuation, a snap-back, or a stall.",
    }),
    noulQ(
      "tape_shape_named",
      "Do `ret.short`, `ret.medium`, and `ret.long` show continuation, a snap-back, or a stall?",
      "One of those three shapes is visible.",
      "None of those three shapes is visible.",
    ),
    noulQ(
      "crowded",
      "Does `ret.short` look crowded next to `realized_vol`?",
      "The short window is a large move beside recent realized vol, the way a chase looks.",
      "The short window sits inside recent realized vol.",
    ),
    noulQ(
      "one_sided",
      "Does `imbalance` show one side of the book dominating the other?",
      "One side is clearly larger.",
      "The two sides are about the same size.",
    ),
  ],
};

assertBattery(gamblerBattery);
