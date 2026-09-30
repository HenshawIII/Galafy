import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service.js';
import { EventLeaderboardService } from '../events/event-leaderboard.service.js';
import { PublicLeaderboardService } from '../events/public-leaderboard.service.js';
import { formatSprayForLive } from '../common/utils/spray-live-payload.util.js';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from 'dotenv';
config();

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
  };
  publicViewer?: {
    eventId: string;
    showAmounts: boolean;
    shareToken: string;
  };
}

@WebSocketGateway({
  namespace: '/live',
  cors: {
    origin: '*', // Allow all origins explicitly
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['*'],
  },
  transports: ['websocket', 'polling'], // Support both transports
})
export class LiveGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LiveGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly databaseService: DatabaseService,
    private readonly eventLeaderboardService: EventLeaderboardService,
    @Inject(forwardRef(() => PublicLeaderboardService))
    private readonly publicLeaderboardService: PublicLeaderboardService,
  ) {
    this.logger.log('LiveGateway class instantiated');
  }

  publicEventRoom(eventId: string): string {
    return `public-event:${eventId}`;
  }

  afterInit(server: Server) {
    this.logger.log(`✅ WebSocket server initialized on namespace /live`);
    this.logger.log(`✅ Server ready to accept connections`);
    this.logger.log(`✅ Server instance created successfully`);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const shareTokenRaw =
        client.handshake.auth?.shareToken || client.handshake.query?.shareToken;
      const shareToken = typeof shareTokenRaw === 'string' ? shareTokenRaw : null;

      if (shareToken) {
        const event = await this.databaseService.event.findFirst({
          where: {
            publicLeaderboardToken: shareToken,
            publicLeaderboardEnabled: true,
            deletedAt: null,
          },
          select: {
            id: true,
            publicLeaderboardShowAmounts: true,
          },
        });

        if (!event) {
          this.logger.warn(`Connection rejected: Invalid public share token for socket ${client.id}`);
          client.disconnect();
          return;
        }

        client.publicViewer = {
          eventId: event.id,
          showAmounts: event.publicLeaderboardShowAmounts,
          shareToken,
        };
        await client.join(this.publicEventRoom(event.id));

        try {
          const snapshot = await this.publicLeaderboardService.getSnapshotByToken(shareToken);
          client.emit('public.leaderboard.joined', snapshot);
        } catch (snapshotError: any) {
          this.logger.warn(
            `Failed to emit public leaderboard snapshot for ${event.id}: ${snapshotError.message}`,
          );
        }

        this.logger.log(`Public viewer connected to event ${event.id} via socket ${client.id}`);
        return;
      }

      const token = client.handshake.auth?.token || client.handshake.query?.token;

      if (!token || typeof token !== 'string') {
        this.logger.warn(`Connection rejected: No token provided for socket ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      if (payload.type && payload.type !== 'access') {
        this.logger.warn(`Connection rejected: Invalid token type for socket ${client.id}`);
        client.disconnect();
        return;
      }

      const user = await this.databaseService.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true },
      });

      if (!user) {
        this.logger.warn(`Connection rejected: User not found for socket ${client.id}`);
        client.disconnect();
        return;
      }

      client.user = {
        id: user.id,
        email: user.email,
      };

      await client.join(`user:${user.id}`);

      this.logger.log(`User ${user.id} connected via socket ${client.id}`);
    } catch (error: any) {
      this.logger.error(`Connection error for socket ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.user) {
      this.logger.log(`User ${client.user.id} disconnected from socket ${client.id}`);
    }
  }

  @SubscribeMessage('event.join')
  async handleJoinEvent(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() data: { eventId: string }) {
    if (!client.user) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    try {
      const { eventId } = data;

      if (!eventId || typeof eventId !== 'string') {
        client.emit('error', { message: 'Invalid eventId' });
        return;
      }

      // Fetch event with participants and sprays
      const event = await this.databaseService.event.findFirst({
        where: { id: eventId, deletedAt: null },
        include: {
          participants: {
            select: {
              id: true,
              role: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  profilePicture: true,
                },
              },
            },
          },
          sprays: {
            include: {
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
                              visibleAtEvents: true,
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
                              visibleAtEvents: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      if (!event) {
        client.emit('error', { message: 'Event not found' });
        return;
      }

      // Format participants
      const participants = (event.participants || []).map((participant: any) => ({
        id: participant.id,
        role: participant.role,
        userId: participant.user.id,
        username: participant.user.username,
        profilePicture: participant.user.profilePicture,
      }));

      // Format sprays with sprayer and receiver info
      const sprays = (event.sprays || [])
        .filter((spray: any) => spray.sprayerWallet?.customer?.user && spray.receiverWallet?.customer?.user)
        .map((spray: any) => formatSprayForLive(spray));

      // Calculate accumulated spray total
      const accumulatedSprayTotal = (event.sprays || []).reduce((sum: Decimal, spray: any) => {
        return sum.plus(spray.totalAmount);
      }, new Decimal(0));

      // Join event room
      await client.join(`event:${eventId}`);

      this.logger.log(`User ${client.user.id} joined event room: event:${eventId}`);

      // Fetch user's wallet balance
      let userWallet: { walletId: string; availableBalance: string; ledgerBalance: string } | null = null;
      try {
        // First, try to get wallet from event participant
        const participant = await this.databaseService.eventParticipant.findUnique({
          where: {
            eventId_userId: {
              eventId,
              userId: client.user.id,
            },
          },
          include: {
            wallet: {
              select: {
                id: true,
                availableBalance: true,
                ledgerBalance: true,
              },
            },
          },
        });

        if (participant?.wallet) {
          userWallet = {
            walletId: participant.wallet.id,
            availableBalance: participant.wallet.availableBalance.toString(),
            ledgerBalance: participant.wallet.ledgerBalance.toString(),
          };
        } else {
          // Fallback: get user's default wallet
          const customer = await this.databaseService.customer.findUnique({
            where: { userId: client.user.id },
            include: {
              wallets: {
                where: { isDefault: true },
                take: 1,
                select: {
                  id: true,
                  availableBalance: true,
                  ledgerBalance: true,
                },
              },
            },
          });

          if (customer?.wallets && customer.wallets.length > 0) {
            const defaultWallet = customer.wallets[0];
            userWallet = {
              walletId: defaultWallet.id,
              availableBalance: defaultWallet.availableBalance.toString(),
              ledgerBalance: defaultWallet.ledgerBalance.toString(),
            };
          }
        }

        // Emit wallet balance to user
        if (userWallet) {
          this.emitBalanceUpdate(client.user.id, {
            walletId: userWallet.walletId,
            availableBalance: userWallet.availableBalance,
            eventBalance: accumulatedSprayTotal.toString(),
          });
        }
      } catch (walletError: any) {
        // Log error but don't fail the join - wallet balance is optional
        this.logger.warn(`Failed to fetch wallet balance for user ${client.user.id}: ${walletError.message}`);
      }

      // Fetch leaderboard
      let leaderboard: any[] | null = null;
      try {
        const leaderboardData: any = await this.eventLeaderboardService.getEventLeaderboard(eventId);
        if (leaderboardData && Array.isArray(leaderboardData.leaderboard)) {
          leaderboard = leaderboardData.leaderboard; // Extract just the leaderboard array
        }
      } catch (leaderboardError: any) {
        // Log error but don't fail the join - leaderboard is optional
        this.logger.warn(`Failed to fetch leaderboard for event ${eventId}: ${leaderboardError.message}`);
      }

      // Return comprehensive event data
      client.emit('event.joined', {
        eventId: event.id,
        eventStatus: event.status,
        participantCount: participants.length,
        sprayCount: sprays.length,
        accumulatedSprayTotal: accumulatedSprayTotal.toString(),
        participants,
        sprays,
        leaderboard,
      });
    } catch (error: any) {
      this.logger.error(`Error joining event: ${error.message}`);
      client.emit('error', { message: 'Failed to join event' });
    }
  }

  @SubscribeMessage('event.leave')
  async handleLeaveEvent(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() data: { eventId: string }) {
    if (!client.user) {
      return;
    }

    try {
      const { eventId } = data;

      if (!eventId || typeof eventId !== 'string') {
        return;
      }

      await client.leave(`event:${eventId}`);

      this.logger.log(`User ${client.user.id} left event room: event:${eventId}`);

      client.emit('event.left', { eventId });
    } catch (error: any) {
      this.logger.error(`Error leaving event: ${error.message}`);
    }
  }

  /**
   * Handle reaction message from client
   * Reactions are ephemeral and don't need to be stored in the database
   */
  @SubscribeMessage('event.reaction')
  async handleReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { eventId: string; reaction: string; targetUserId?: string },
  ) {
    if (!client.user) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    try {
      const { eventId, reaction, targetUserId } = data;

      if (!eventId || typeof eventId !== 'string') {
        client.emit('error', { message: 'Invalid eventId' });
        return;
      }

      if (!reaction || typeof reaction !== 'string') {
        client.emit('error', { message: 'Invalid reaction' });
        return;
      }

      // Validate reaction type (allowed emojis)
      const allowedReactions = ['🔥', '❤️', '🎉', '😂', '💚', '👍', '👏', '🎊'];
      if (!allowedReactions.includes(reaction)) {
        client.emit('error', { message: 'Invalid reaction type' });
        return;
      }

      // Verify user is a participant in the event
      const participant = await this.databaseService.eventParticipant.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId: client.user.id,
          },
        },
      });

      if (!participant) {
        client.emit('error', { message: 'You are not a participant in this event' });
        return;
      }

      // Get user details for the reaction
      const user = await this.databaseService.user.findUnique({
        where: { id: client.user.id },
        select: {
          id: true,
          username: true,
          profilePicture: true,
        },
      });

      // Broadcast reaction to all event subscribers
      this.emitReaction(eventId, {
        eventId,
        reaction,
        user: {
          id: user?.id || client.user.id,
          username: user?.username || null,
          profilePicture: user?.profilePicture || null,
        },
        targetUserId: targetUserId || null, // If null, reaction is for the event in general
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`User ${client.user.id} sent reaction ${reaction} in event:${eventId}`);
    } catch (error: any) {
      this.logger.error(`Error handling reaction: ${error.message}`);
      client.emit('error', { message: 'Failed to send reaction' });
    }
  }

  /**
   * Broadcast participant.joined to everyone subscribed to the event room.
   */
  emitParticipantJoined(
    eventId: string,
    payload: {
      eventId: string;
      participant: {
        id: string;
        role: string;
        userId: string;
        username: string | null;
        profilePicture: string | null;
      };
      participantCount: number;
    },
  ) {
    this.server.to(`event:${eventId}`).emit('participant.joined', payload);
    this.logger.log(`Emitted participant.joined to event:${eventId} (user ${payload.participant.userId})`);
  }

  /**
   * Broadcast participant.left to everyone subscribed to the event room.
   */
  emitParticipantLeft(
    eventId: string,
    payload: {
      eventId: string;
      userId: string;
      username: string | null;
      profilePicture: string | null;
      participantCount: number;
    },
  ) {
    this.server.to(`event:${eventId}`).emit('participant.left', payload);
    this.logger.log(`Emitted participant.left to event:${eventId} (user ${payload.userId})`);
  }

  /**
   * Emit spray.created event to event room
   */
  emitSprayCreated(eventId: string, payload: any) {
    this.server.to(`event:${eventId}`).emit('spray.created', payload);
    this.logger.log(`Emitted spray.created to event:${eventId}`);
  }

  /**
   * Emit sanitized spray activity to public leaderboard viewers.
   */
  emitPublicSprayCreated(eventId: string, payload: any) {
    this.server.to(this.publicEventRoom(eventId)).emit('public.spray.created', payload);
    this.logger.log(`Emitted public.spray.created to ${this.publicEventRoom(eventId)}`);
  }

  /**
   * Emit sanitized leaderboard snapshot to public viewers.
   */
  emitPublicLeaderboardUpdate(eventId: string, payload: any) {
    this.server.to(this.publicEventRoom(eventId)).emit('public.leaderboard.updated', payload);
    this.logger.log(`Emitted public.leaderboard.updated to ${this.publicEventRoom(eventId)}`);
  }

  /**
   * Kick public viewers after revoke/regenerate so old share sessions stop immediately.
   */
  async revokePublicLeaderboardViewers(eventId: string): Promise<void> {
    const room = this.publicEventRoom(eventId);
    this.server.to(room).emit('public.leaderboard.revoked', {
      eventId,
      message: 'This leaderboard link is no longer available.',
    });

    try {
      const sockets = await this.server.in(room).fetchSockets();
      await Promise.all(
        sockets.map(async (socket) => {
          await socket.leave(room);
          socket.disconnect(true);
        }),
      );
      this.logger.log(`Revoked ${sockets.length} public leaderboard viewer(s) for ${room}`);
    } catch (error: any) {
      this.logger.warn(`Failed to disconnect public viewers for ${room}: ${error.message}`);
    }
  }

  /**
   * Emit reaction to event room
   * Broadcasts reactions to all subscribers in the event
   */
  emitReaction(
    eventId: string,
    payload: {
      eventId: string;
      reaction: string;
      user: {
        id: string;
        username: string | null;
        profilePicture: string | null;
      };
      targetUserId?: string | null;
      timestamp: string;
    },
  ) {
    this.server.to(`event:${eventId}`).emit('event.reaction', payload);
    this.logger.log(`Emitted reaction ${payload.reaction} to event:${eventId}`);
  }

  /**
   * Emit balance update to user's private room
   */
  emitBalanceUpdate(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('user.balance.updated', payload);
    this.logger.log(`Emitted user.balance.updated to user:${userId}`);
  }

  /**
   * Emit spray failed event to user's private room
   */
  emitSprayFailed(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('spray.failed', payload);
    this.logger.log(`Emitted spray.failed to user:${userId}`);
  }

  /**
   * Emit leaderboard update to event room
   */
  emitLeaderboardUpdate(eventId: string, payload: any) {
    this.server.to(`event:${eventId}`).emit('leaderboard.updated', payload);
    this.logger.log(`Emitted leaderboard.updated to event:${eventId}`);
  }

  /**
   * Emit sprays array update to event room
   */
  emitSpraysUpdate(eventId: string, sprays: any[]) {
    this.server.to(`event:${eventId}`).emit('sprays.updated', { sprays });
    this.logger.log(`Emitted sprays.updated to event:${eventId}`);
  }
}
