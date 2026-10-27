import { assertBattery, choiceQ, noulQ, type Battery } from "./spec.js";

/** Disagreement and regime judgments. Code decides whether they confirm a direction. */
export const spyBattery: Battery = {
  bot: "spy",
  questions: [
    choiceQ("disagreement", "How do `imbalance` and `ret.short` sit together?", {
      book_fights_tape: "The book leans against the short-window return.",
      book_agrees: "The book leans with the short-window return.",
      both_quiet: "The book is balanced and the short window is flat.",
      other: "The book and the short window do not fight, agree, or sit quiet.",
    }),
    noulQ(
      "disagreement_named",
      "Do `imbalance` and `ret.short` fight, agree, or sit quiet?",
      "One of those three readings is visible.",
      "None of those three readings is visible.",
    ),
    choiceQ("vol_regime", "Which regime does `realized_vol` show beside `ret`?", {
      quiet: "Realized vol is quiet and the windows are small.",
      ordinary: "Realized vol and the windows look like a normal session.",
      jumpy: "Realized vol is elevated, or the short window jumps away from the longer windows.",
      other: "Vol does not look quiet, ordinary, or jumpy.",
    }),
    noulQ(
      "vol_regime_named",
      "Does `realized_vol` beside `ret` look quiet, ordinary, or jumpy?",
      "One of those three regimes is visible.",
      "None of those three regimes is visible.",
    ),
    noulQ(
      "push_through_spread",
      "Does `ret.short` look large while `spread_bps` stays tight?",
      "The short window is a large move and the spread stays tight.",
      "The short window is small beside the spread.",
    ),
    noulQ(
      "quiet_before",
      "Do `ret.medium` and `ret.long` look quiet next to `ret.short`?",
      "The longer windows are quiet beside a busier short window.",
      "The longer windows are as busy as the short window.",
    ),
  ],
};

assertBattery(spyBattery);
