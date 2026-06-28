import { Decimal } from '@prisma/client/runtime/library';

type SprayLiveUser = {
  id: string;
  username: string | null;
  profilePicture: string | null;
  showOnLeaderboard: boolean;
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
        username: string | null;
        profilePicture: string | null;
        settings?: { showOnLeaderboard: boolean | null } | null;
      } | null;
    } | null;
  } | null;
  receiverWallet?: {
    customer?: {
      user?: {
        id: string;
        username: string | null;
        profilePicture: string | null;
        settings?: { showOnLeaderboard: boolean | null } | null;
      } | null;
    } | null;
  } | null;
};

function formatLiveUser(
  user:
    | {
        id: string;
        username: string | null;
        profilePicture: string | null;
        settings?: { showOnLeaderboard: boolean | null } | null;
      }
    | null
    | undefined,
): SprayLiveUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    profilePicture: user.profilePicture,
    showOnLeaderboard: user.settings?.showOnLeaderboard ?? true,
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

export const SPRAY_LIVE_INCLUDE = {
  sprayerWallet: {
    include: {
      customer: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profilePicture: true,
              settings: {
                select: {
                  showOnLeaderboard: true,
                },
              },
            },
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
            select: {
              id: true,
              username: true,
              profilePicture: true,
              settings: {
                select: {
                  showOnLeaderboard: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
