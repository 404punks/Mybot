/**
 * Pinned Jev id. A floating alias moves when a release ships,
 * so every request sends this id and every response must echo it.
 */
export const PINNED_MODEL = "jev-1.14.0";

export function isPinnedModel(model: string | null | undefined): model is typeof PINNED_MODEL {
  return model === PINNED_MODEL;
}
