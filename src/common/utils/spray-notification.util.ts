const EVENT_SPRAY_NARRATION = /Spray in event/i;
const EVENT_ID_IN_NARRATION = /EventId[:\s]+([0-9a-f-]{36})/i;
const WALLET_TRANSFER_NARRATION = /Wallet transfer to/i;

/** Matches event spray narrations created by SpraysService.startTier2 spray flow. */
export function isEventSprayNarration(narration: unknown): boolean {
  const n = typeof narration === 'string' ? narration.trim() : '';
  if (!n) return false;
  return EVENT_SPRAY_NARRATION.test(n) && EVENT_ID_IN_NARRATION.test(n);
}

export function parseEventIdFromSprayNarration(narration: unknown): string | null {
  const n = typeof narration === 'string' ? narration.trim() : '';
  if (!n) return null;
  const match = n.match(EVENT_ID_IN_NARRATION);
  return match?.[1] ?? null;
}

/** Internal wallet-to-wallet or event spray credits — must not run funding inflow logic. */
export function isInternalSprayTransferNarration(narration: unknown): boolean {
  if (isEventSprayNarration(narration)) return true;
  const n = typeof narration === 'string' ? narration.trim() : '';
  if (!n) return false;
  return WALLET_TRANSFER_NARRATION.test(n);
}
