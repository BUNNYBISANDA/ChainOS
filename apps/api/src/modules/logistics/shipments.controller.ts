import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ShipmentDirection, ShipmentExceptionStatus, ShipmentStatus } from "@chainos/database";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { CreateShipmentEventDto } from "./dto/create-shipment-event.dto";
import { UpdateShipmentEtaDto } from "./dto/update-shipment-eta.dto";
import { ShipmentsService } from "./shipments.service";

@Controller("shipments")
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post()
  @RequirePermissions("shipment:create")
  create(@Body() dto: CreateShipmentDto) {
    return this.shipments.create(dto);
  }

  @Get()
  list(
    @Query("status") status?: ShipmentStatus,
    @Query("direction") direction?: ShipmentDirection,
    @Query("delayed") delayed?: string,
    @Query("needsAttention") needsAttention?: string,
    @Query("exceptionStatus") exceptionStatus?: ShipmentExceptionStatus,
    @Query("search") search?: string,
  ) {
    return this.shipments.list({
      status,
      direction,
      delayed: delayed === "true" ? true : undefined,
      needsAttention: needsAttention === "true" ? true : undefined,
      exceptionStatus,
      search,
    });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.shipments.get(id);
  }

  @Get(":id/events")
  events(@Param("id") id: string) {
    return this.shipments.eventsForShipment(id);
  }

  @Post(":id/events")
  @RequirePermissions("shipment:tracking:create")
  createEvent(@Param("id") id: string, @Body() dto: CreateShipmentEventDto) {
    return this.shipments.createManualEvent(id, dto);
  }

  @Post(":id/eta")
  @RequirePermissions("shipment:eta:update")
  updateEta(@Param("id") id: string, @Body() dto: UpdateShipmentEtaDto) {
    return this.shipments.updateEta(id, dto);
  }

  @Get(":id/exceptions")
  @RequirePermissions("shipment:exceptions:read")
  exceptions(@Param("id") id: string) {
    return this.shipments.exceptionsForShipment(id);
  }

  @Post(":id/book")
  @RequirePermissions("shipment:update")
  book(@Param("id") id: string) {
    return this.shipments.book(id);
  }

  @Post(":id/dispatch")
  @RequirePermissions("shipment:update")
  dispatch(@Param("id") id: string) {
    return this.shipments.dispatch(id);
  }

  @Post(":id/arrive")
  @RequirePermissions("shipment:update")
  arrive(@Param("id") id: string) {
    return this.shipments.arrive(id);
  }

  @Post(":id/deliver")
  @RequirePermissions("shipment:update")
  deliver(@Param("id") id: string) {
    return this.shipments.deliver(id);
  }

  @Post(":id/cancel")
  @RequirePermissions("shipment:update")
  cancel(@Param("id") id: string) {
    return this.shipments.cancel(id);
  }
}
