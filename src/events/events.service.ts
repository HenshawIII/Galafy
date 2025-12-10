import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CreateEventDto, UpdateEventDto, JoinEventDto } from './dto/index.js';
import { EventStatus, EventRole, EventVisibility, KycTier } from '../../generated/prisma/enums.js';
import { randomUUID } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class EventsService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Generate a unique event code
   */
  private generateEventCode(): string {
    // Generate a 6-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Check if user has required KYC tier for a role
   */
  private async checkKycTierForRole(userId: string, role: EventRole): Promise<void> {
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      select: { tier: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found for this user');
    }

    // CELEBRANT and PERFORMER require Tier_2 or higher
    if ((role === EventRole.CELEBRANT || role === EventRole.PERFORMER) && 
        (customer.tier === KycTier.Tier_0 || customer.tier === KycTier.Tier_1)) {
      throw new ForbiddenException(
        `You need at least KYC Tier_2 to be a ${role}. Your current tier is ${customer.tier}.`
      );
    }
  }

  /**
   * Create a new event
   * Only users with Tier_2 or Tier_3 can create events
   */
  async createEvent(userId: string, createEventDto: CreateEventDto) {
    // Verify user exists
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check KYC tier from customer table
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      select: { tier: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found for this user');
    }

    // Only Tier_2 and Tier_3 users can create events
    if (customer.tier !== KycTier.Tier_2 && customer.tier !== KycTier.Tier_3) {
      throw new ForbiddenException(
        `You need at least KYC Tier_2 to create events. Your current tier is ${customer.tier}. Please complete your KYC verification to upgrade.`
      );
    }

    // Generate unique event code
    let eventCode: string;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      eventCode = this.generateEventCode();
      const existing = await this.databaseService.event.findUnique({
        where: { code: eventCode },
      });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new BadRequestException('Failed to generate unique event code. Please try again.');
    }

    // Determine status based on goLiveInstantly
    const status = createEventDto.goLiveInstantly ? EventStatus.LIVE : EventStatus.SCHEDULED;
    const startAt = createEventDto.goLiveInstantly 
      ? new Date() 
      : new Date(createEventDto.startAt);

    // Create event
    const event = await this.databaseService.event.create({
      data: {
        code: eventCode!,
        title: createEventDto.title,
        name: createEventDto.title, // Keep name same as title for backward compatibility
        location: createEventDto.location,
        category: createEventDto.category,
        description: createEventDto.description,
        imageUrl: createEventDto.imageUrl,
        imagePath: createEventDto.imagePath,
        goLiveInstantly: createEventDto.goLiveInstantly,
        sprayGoal: createEventDto.sprayGoal ? new Decimal(createEventDto.sprayGoal) : null,
        minSprayAmount: createEventDto.minSprayAmount ? new Decimal(createEventDto.minSprayAmount) : null,
        hostUserId: userId,
        status: status,
        startsAt: startAt,
        endsAt: createEventDto.endsAt ? new Date(createEventDto.endsAt) : null,
        visibility: createEventDto.visibility || EventVisibility.PUBLIC,
      },
      include: {
        hostUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            sprays: true,
          },
        },
      },
    });

    // Automatically add creator as CELEBRANT if they have Tier_2+
    if (customer.tier === KycTier.Tier_2 || customer.tier === KycTier.Tier_3) {
      await this.databaseService.eventParticipant.create({
        data: {
          eventId: event.id,
          userId: userId,
          role: EventRole.CELEBRANT,
        },
      });
    } else {
      // Otherwise add as ATTENDEE
      await this.databaseService.eventParticipant.create({
        data: {
          eventId: event.id,
          userId: userId,
          role: EventRole.ATTENDEE,
        },
      });
    }

    // Return event with updated participants
    return this.databaseService.event.findUnique({
      where: { id: event.id },
      include: {
        hostUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            sprays: true,
          },
        },
      },
    });
  }

  /**
   * Get all events with optional filters
   */
  async findAll(filters?: {
    status?: EventStatus;
    visibility?: EventVisibility;
    category?: string;
    hostUserId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.visibility) where.visibility = filters.visibility;
    if (filters?.category) where.category = filters.category;
    if (filters?.hostUserId) where.hostUserId = filters.hostUserId;

    const [events, total] = await Promise.all([
      this.databaseService.event.findMany({
        where,
        include: {
          hostUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
          _count: {
            select: {
              participants: true,
              sprays: true,
            },
          },
        },
        orderBy: {
          startsAt: 'desc',
        },
        skip,
        take: pageSize,
      }),
      this.databaseService.event.count({ where }),
    ]);

    return {
      events,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get a single event by ID
   */
  async findOne(id: string) {
    const event = await this.databaseService.event.findUnique({
      where: { id },
      include: {
        hostUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
            wallet: {
              select: {
                id: true,
                virtualAccountNumber: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            sprays: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    return event;
  }

  /**
   * Get event by code
   */
  async findByCode(code: string) {
    const event = await this.databaseService.event.findUnique({
      where: { code },
      include: {
        hostUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
            wallet: {
              select: {
                id: true,
                virtualAccountNumber: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            sprays: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with code ${code} not found`);
    }

    return event;
  }

  /**
   * Update an event (only by host)
   */
  async updateEvent(eventId: string, userId: string, updateEventDto: UpdateEventDto) {
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Only host can update
    if (event.hostUserId !== userId) {
      throw new ForbiddenException('Only the event host can update this event');
    }

    // Prepare update data
    const updateData: any = {};
    // Type assertion to access properties from PartialType
    const dto = updateEventDto as Partial<CreateEventDto> & { status?: EventStatus };
    
    if (dto.title !== undefined) {
      updateData.title = dto.title;
      updateData.name = dto.title; // Keep name in sync
    }
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl;
    if (dto.imagePath !== undefined) updateData.imagePath = dto.imagePath;
    if (dto.goLiveInstantly !== undefined) updateData.goLiveInstantly = dto.goLiveInstantly;
    if (dto.sprayGoal !== undefined) {
      updateData.sprayGoal = dto.sprayGoal !== null ? new Decimal(dto.sprayGoal) : null;
    }
    if (dto.minSprayAmount !== undefined) {
      updateData.minSprayAmount = dto.minSprayAmount !== null 
        ? new Decimal(dto.minSprayAmount) 
        : null;
    }
    if (dto.startAt !== undefined) updateData.startsAt = new Date(dto.startAt);
    if (dto.endsAt !== undefined) {
      updateData.endsAt = dto.endsAt !== null ? new Date(dto.endsAt) : null;
    }
    if (dto.visibility !== undefined) updateData.visibility = dto.visibility;
    if (dto.status !== undefined) updateData.status = dto.status;

    const updatedEvent = await this.databaseService.event.update({
      where: { id: eventId },
      data: updateData,
      include: {
        hostUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            sprays: true,
          },
        },
      },
    });

    return updatedEvent;
  }

  /**
   * Delete an event (only by host)
   */
  async removeEvent(eventId: string, userId: string) {
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Only host can delete
    if (event.hostUserId !== userId) {
      throw new ForbiddenException('Only the event host can delete this event');
    }

    await this.databaseService.event.delete({
      where: { id: eventId },
    });

    return { message: 'Event deleted successfully' };
  }

  /**
   * Join an event as a participant
   */
  async joinEvent(eventId: string, userId: string, joinEventDto: JoinEventDto) {
    // Check if event exists
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Check KYC tier for role
    await this.checkKycTierForRole(userId, joinEventDto.role);

    // Check if user is already a participant
    const existingParticipant = await this.databaseService.eventParticipant.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });

    if (existingParticipant) {
      // Update role if different
      if (existingParticipant.role !== joinEventDto.role) {
        // Check KYC tier for new role
        await this.checkKycTierForRole(userId, joinEventDto.role);
        
        return this.databaseService.eventParticipant.update({
          where: { id: existingParticipant.id },
          data: {
            role: joinEventDto.role,
            walletId: joinEventDto.walletId || existingParticipant.walletId,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
            wallet: {
              select: {
                id: true,
                virtualAccountNumber: true,
                name: true,
              },
            },
          },
        });
      }
      throw new ConflictException('You are already a participant in this event');
    }

    // Validate wallet if provided
    if (joinEventDto.walletId) {
      const wallet = await this.databaseService.wallet.findUnique({
        where: { id: joinEventDto.walletId },
        include: { customer: true },
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet with ID ${joinEventDto.walletId} not found`);
      }

      // Verify wallet belongs to user
      if (wallet.customer.userId !== userId) {
        throw new ForbiddenException('Wallet does not belong to you');
      }
    }

    // Create participant
    const participant = await this.databaseService.eventParticipant.create({
      data: {
        eventId,
        userId,
        role: joinEventDto.role,
        walletId: joinEventDto.walletId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        wallet: {
          select: {
            id: true,
            virtualAccountNumber: true,
            name: true,
          },
        },
      },
    });

    return participant;
  }

  /**
   * Leave an event
   */
  async leaveEvent(eventId: string, userId: string) {
    const participant = await this.databaseService.eventParticipant.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('You are not a participant in this event');
    }

    // Host cannot leave their own event
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
    });

    if (event?.hostUserId === userId) {
      throw new BadRequestException('Event host cannot leave their own event');
    }

    await this.databaseService.eventParticipant.delete({
      where: { id: participant.id },
    });

    return { message: 'Successfully left the event' };
  }

  /**
   * Get events for a specific user
   */
  async getUserEvents(userId: string, role?: EventRole) {
    const where: any = { userId };
    if (role) where.role = role;

    const participants = await this.databaseService.eventParticipant.findMany({
      where,
      include: {
        event: {
          include: {
            hostUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
            _count: {
              select: {
                participants: true,
                sprays: true,
              },
            },
          },
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    return participants.map(p => ({
      ...p.event,
      userRole: p.role,
      joinedAt: p.joinedAt,
    }));
  }

  /**
   * Get all participants (users and their roles) for a specific event
   */
  async getEventParticipants(eventId: string) {
    // First verify the event exists
    const event = await this.databaseService.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Get all participants with their user details
    const participants = await this.databaseService.eventParticipant.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            phone: true,
          },
        },
        wallet: {
          select: {
            id: true,
            virtualAccountNumber: true,
            availableBalance: true,
            ledgerBalance: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' }, // Order by role (CELEBRANT, PERFORMER, ATTENDEE)
        { joinedAt: 'asc' }, // Then by join date
      ],
    });

    return {
      eventId,
      totalParticipants: participants.length,
      participants: participants.map(p => ({
        id: p.id,
        userId: p.userId,
        role: p.role,
        joinedAt: p.joinedAt,
        user: {
          id: p.user.id,
          email: p.user.email,
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          username: p.user.username,
          phone: p.user.phone,
        },
        wallet: p.wallet ? {
          id: p.wallet.id,
          virtualAccountNumber: p.wallet.virtualAccountNumber,
          availableBalance: p.wallet.availableBalance,
          ledgerBalance: p.wallet.ledgerBalance,
        } : null,
      })),
    };
  }
}
