const EVENT_SPRAY_NARRATION = /Spray in event/i;
const EVENT_ID_IN_NARRATION = /EventId[:\s]+([0-9a-f-]{36})/i;
const WALLET_TRANSFER_NARRATION = /Wallet transfer to/i;

/** Matches event spray narrations created by SpraysService (legacy and EventId-first formats). */
export function isEventSprayNarration(narration: unknown): boolean {
  const n = typeof narration === 'string' ? narration.trim() : '';
  if (!n) return false;
  if (!EVENT_ID_IN_NARRATION.test(n)) return false;
  return EVENT_SPRAY_NARRATION.test(n) || /^EventId:/i.test(n);
}

/** Default narration for event sprays — EventId first so provider truncation keeps the UUID. */
export function buildEventSprayNarration(eventId: string, eventTitle: string): string {
  return `EventId:${eventId} Spray in ${eventTitle}`;
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

export type SprayPushPayload = {
  notification: { title: string; body: string };
  data: Record<string, string>;
};

export type SprayNotificationKind = 'SPRAY_SENT' | 'SPRAY_FAILED';

export type SprayNotificationInput = {
  kind: SprayNotificationKind;
  amountFormatted: string;
  transactionReference: string;
  eventId?: string;
  eventTitle?: string;
};

export function buildSprayPushNotification(input: SprayNotificationInput): SprayPushPayload {
  const amount = input.amountFormatted;
  const eventTitle = input.eventTitle?.trim() || 'Event';

  switch (input.kind) {
    case 'SPRAY_SENT':
      return {
        notification: {
          title: 'Spray sent',
          body: `Your spray of ₦${amount} at ${eventTitle} was sent successfully`,
        },
        data: {
          type: 'SPRAY_SENT',
          amount,
          reference: input.transactionReference,
          eventId: input.eventId ?? '',
          eventTitle,
        },
      };
    case 'SPRAY_FAILED':
      return {
        notification: {
          title: 'Spray failed',
          body: `Your spray of ₦${amount} at ${eventTitle} could not be completed`,
        },
        data: {
          type: 'SPRAY_FAILED',
          amount,
          reference: input.transactionReference,
          eventId: input.eventId ?? '',
          eventTitle,
        },
      };
  }
}

export function isSprayDebitTransaction(txn: {
  type: string;
  metadata: unknown;
}): boolean {
  if (txn.type === 'SPRAY') {
    return true;
  }
  const meta =
    typeof txn.metadata === 'object' && txn.metadata !== null
      ? (txn.metadata as Record<string, unknown>)
      : null;
  return meta?.eventSpray === true || meta?.walletToWalletSpray === true;
}

export function getSprayNotificationContext(metadata: unknown): {
  eventId: string;
  eventTitle: string;
} {
  const meta =
    typeof metadata === 'object' && metadata !== null
      ? (metadata as Record<string, unknown>)
      : null;
  const sprayCompletion =
    typeof meta?.sprayCompletion === 'object' && meta.sprayCompletion !== null
      ? (meta.sprayCompletion as Record<string, unknown>)
      : null;

  return {
    eventId: typeof sprayCompletion?.eventId === 'string' ? sprayCompletion.eventId : '',
    eventTitle: typeof sprayCompletion?.eventTitle === 'string' ? sprayCompletion.eventTitle : 'Event',
  };
}
