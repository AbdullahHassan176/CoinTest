/**
 * Single pin block for X / TG / site — “wrong coin” guardrail.
 * Keep wording identical across surfaces; do not paraphrase.
 */
export const OFFICIAL_STRAIT_PIN = {
  line1: "Official $STRAIT (Strait of Hormuz) — stateofhormuz.org only.",
  line2: "We are not the unaffiliated $HORMUZ on Birdeye. Always confirm the contract from our site.",
} as const;

/** One block for bios / paste (newline between sentences). */
export const OFFICIAL_STRAIT_PIN_PASTE = `${OFFICIAL_STRAIT_PIN.line1}\n${OFFICIAL_STRAIT_PIN.line2}`;
