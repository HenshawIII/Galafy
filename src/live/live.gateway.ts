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
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service.js';
import { EventsService } from '../events/events.service.js';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from 'dotenv';
config();

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
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
    private readonly eventsService: EventsService,
  ) {
    // Log when gateway class is instantiated
    this.logger.log('LiveGateway class instantiated');
  }

  afterInit(server: Server) {
    this.logger.log(`✅ WebSocket server initialized on namespace /live`);
    this.logger.log(`✅ Server ready to accept connections`);
    this.logger.log(`✅ Server instance created successfully`);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from auth object or handshake query
      const token = client.handshake.auth?.token || client.handshake.query?.token;

      if (!token || typeof token !== 'string') {
        this.logger.warn(`Connection rejected: No token provided for socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      // Ensure this is an access token
      if (payload.type && payload.type !== 'access') {
        this.logger.warn(`Connection rejected: Invalid token type for socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Get user from database
      const user = await this.databaseService.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true },
      });

      if (!user) {
        this.logger.warn(`Connection rejected: User not found for socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Attach user to socket
      client.user = {
        id: user.id,
        email: user.email,
      };

      // Join user's private room
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
        .map((spray: any) => ({
          id: spray.id,
          totalAmount: spray.totalAmount.toString(),
          note: spray.note,
          createdAt: spray.createdAt,
          updatedAt: spray.updatedAt,
          sprayer: {
            id: spray.sprayerWallet.customer.user.id,
            username: spray.sprayerWallet.customer.user.username,
            profilePicture: spray.sprayerWallet.customer.user.profilePicture,
            showOnLeaderboard: spray.sprayerWallet.customer.user.settings?.showOnLeaderboard ?? true,
          },
          receiver: {
            id: spray.receiverWallet.customer.user.id,
            username: spray.receiverWallet.customer.user.username,
            profilePicture: spray.receiverWallet.customer.user.profilePicture,
          },
        }));

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
        const leaderboardData: any = await this.eventsService.getEventLeaderboard(eventId);
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
   * Emit spray.created event to event room
   */
  emitSprayCreated(eventId: string, payload: any) {
    this.server.to(`event:${eventId}`).emit('spray.created', payload);
    this.logger.log(`Emitted spray.created to event:${eventId}`);
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
