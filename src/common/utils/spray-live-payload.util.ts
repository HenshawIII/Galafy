import { Decimal } from '@prisma/client/runtime/library';

type SprayLiveUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  profilePicture: string | null;
  showOnLeaderboard: boolean;
  visibleAtEvents: boolean;
};

export type SprayLivePayload = {
  id: string;
  totalAmount: string;
  note: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  sprayer: SprayLiveUser | null;
  receiver: SprayLiveUser | null;
};

type SprayLiveRow = {
  id: string;
  totalAmount: Decimal;
  note: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sprayerWallet?: {
    customer?: {
      user?: {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        username: string | null;
        profilePicture: string | null;
        settings?: { showOnLeaderboard: boolean | null; visibleAtEvents: boolean | null } | null;
      } | null;
    } | null;
  } | null;
  receiverWallet?: {
    customer?: {
      user?: {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        username: string | null;
        profilePicture: string | null;
        settings?: { showOnLeaderboard: boolean | null; visibleAtEvents: boolean | null } | null;
      } | null;
    } | null;
  } | null;
};

function formatLiveUser(
  user:
    | {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        username: string | null;
        profilePicture: string | null;
        settings?: { showOnLeaderboard: boolean | null; visibleAtEvents: boolean | null } | null;
      }
    | null
    | undefined,
): SprayLiveUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    username: user.username,
    profilePicture: user.profilePicture,
    showOnLeaderboard: user.settings?.showOnLeaderboard ?? true,
    visibleAtEvents: user.settings?.visibleAtEvents ?? true,
  };
}

export function formatSprayForLive(spray: SprayLiveRow): SprayLivePayload {
  return {
    id: spray.id,
    totalAmount: spray.totalAmount.toString(),
    note: spray.note,
    status: spray.status,
    createdAt: spray.createdAt.toISOString(),
    updatedAt: spray.updatedAt.toISOString(),
    sprayer: formatLiveUser(spray.sprayerWallet?.customer?.user),
    receiver: formatLiveUser(spray.receiverWallet?.customer?.user),
  };
}

const LIVE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  profilePicture: true,
  settings: {
    select: {
      showOnLeaderboard: true,
      visibleAtEvents: true,
    },
  },
} as const;

export const SPRAY_LIVE_INCLUDE = {
  sprayerWallet: {
    include: {
      customer: {
        include: {
          user: {
            select: LIVE_USER_SELECT,
          },
        },
      },
    },
  },
  receiverWallet: {
    include: {
      customer: {
        include: {
          user: {
            select: LIVE_USER_SELECT,
          },
        },
      },
    },
  },
} as const;
