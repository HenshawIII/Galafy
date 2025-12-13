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
  async handleJoinEvent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { eventId: string },
  ) {
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

      // Lightweight check: verify event exists
      const event = await this.databaseService.event.findUnique({
        where: { id: eventId },
        select: { id: true, status: true },
      });

      if (!event) {
        client.emit('error', { message: 'Event not found' });
        return;
      }

      // Join event room
      await client.join(`event:${eventId}`);

      this.logger.log(`User ${client.user.id} joined event room: event:${eventId}`);

      client.emit('event.joined', { eventId });
    } catch (error: any) {
      this.logger.error(`Error joining event: ${error.message}`);
      client.emit('error', { message: 'Failed to join event' });
    }
  }

  @SubscribeMessage('event.leave')
  async handleLeaveEvent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { eventId: string },
  ) {
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
   * Emit spray.created event to event room
   */
  emitSprayCreated(eventId: string, payload: any) {
    this.server.to(`event:${eventId}`).emit('spray.created', payload);
    this.logger.log(`Emitted spray.created to event:${eventId}`);
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
}

