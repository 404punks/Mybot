/**
 * Combination weights. Positive weights describe support. Penalty weights
 * are subtracted. They are starting weights, not fit to a tape.
 * Open support sums to 1, so penalties can only pull a score down.
 */
export const OPEN_WEIGHTS = {
  continuation: 0.34,
  notCrowded: 0.22,
  oneSidedAgrees: 0.14,
  bookAgrees: 0.16,
  pushThrough: 0.14,
  stretchedWithMove: 0.2,
  jumpy: 0.1,
  spreadPays: 0.1,
} as const;

/** A close needs more than one of these. The weights sum to 1. */
export const CLOSE_WEIGHTS = {
  snapBack: 0.4,
  stretchedAgainst: 0.2,
  bookFights: 0.2,
  inventoryPressing: 0.1,
  crowded: 0.1,
} as const;

/** A companion noul at or above this uses its Choice. Below it, the Choice adds nothing. */
export const NAMED_YES = 0.7;
