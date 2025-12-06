import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { EventsService } from './events.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateEventDto, UpdateEventDto, JoinEventDto } from './dto/index.js';
import { EventStatus, EventVisibility, EventRole } from '../../generated/prisma/enums.js';

@ApiTags('Events')
@Controller('events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event (requires KYC Tier_2 or Tier_3)' })
  @ApiBody({ type: CreateEventDto })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid event data' })
  @ApiResponse({ status: 403, description: 'Forbidden - Requires KYC Tier_2 or Tier_3 to create events' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async createEvent(
    @Request() req: any,
    @Body(ValidationPipe) createEventDto: CreateEventDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.eventsService.createEvent(userId, createEventDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all events with optional filters' })
  @ApiQuery({ name: 'status', enum: EventStatus, required: false, description: 'Filter by event status' })
  @ApiQuery({ name: 'visibility', enum: EventVisibility, required: false, description: 'Filter by visibility' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'hostUserId', required: false, description: 'Filter by host user ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  async findAll(
    @Query('status') status?: EventStatus,
    @Query('visibility') visibility?: EventVisibility,
    @Query('category') category?: string,
    @Query('hostUserId') hostUserId?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.eventsService.findAll({
      status,
      visibility,
      category,
      hostUserId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('my-events')
  @ApiOperation({ summary: 'Get all events for the authenticated user' })
  @ApiQuery({ name: 'role', enum: EventRole, required: false, description: 'Filter by role in events' })
  @ApiResponse({ status: 200, description: 'User events retrieved successfully' })
  async getMyEvents(
    @Request() req: any,
    @Query('role') role?: EventRole,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.eventsService.getUserEvents(userId, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single event by ID' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Event retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Get('code/:code')
  @ApiExcludeEndpoint() 
  @ApiOperation({ summary: 'Get an event by code' })
  @ApiParam({ name: 'code', description: 'Event code (6-character alphanumeric)' })
  @ApiResponse({ status: 200, description: 'Event retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async findByCode(@Param('code') code: string) {
    return this.eventsService.findByCode(code);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an event (only by host)' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiBody({ type: UpdateEventDto })
  @ApiResponse({ status: 200, description: 'Event updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only host can update' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async updateEvent(
    @Request() req: any,
    @Param('id') id: string,
    @Body(ValidationPipe) updateEventDto: UpdateEventDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.eventsService.updateEvent(id, userId, updateEventDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an event (only by host)' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Event deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only host can delete' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async removeEvent(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.eventsService.removeEvent(id, userId);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join an event as a participant' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiBody({ type: JoinEventDto })
  @ApiResponse({ status: 201, description: 'Successfully joined the event' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient KYC tier for role' })
  @ApiResponse({ status: 404, description: 'Event or wallet not found' })
  @ApiResponse({ status: 409, description: 'Conflict - Already a participant' })
  async joinEvent(
    @Request() req: any,
    @Param('id') id: string,
    @Body(ValidationPipe) joinEventDto: JoinEventDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.eventsService.joinEvent(id, userId, joinEventDto);
  }

  @Delete(':id/leave')
  @ApiOperation({ summary: 'Leave an event' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Successfully left the event' })
  @ApiResponse({ status: 400, description: 'Bad request - Host cannot leave their own event' })
  @ApiResponse({ status: 404, description: 'Not a participant in this event' })
  async leaveEvent(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID is required. Please ensure you are authenticated.');
    }
    return this.eventsService.leaveEvent(id, userId);
  }
}
