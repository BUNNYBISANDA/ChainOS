import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ShipmentDirection, ShipmentStatus } from "@chainos/database";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
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
  list(@Query("status") status?: ShipmentStatus, @Query("direction") direction?: ShipmentDirection) {
    return this.shipments.list({ status, direction });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.shipments.get(id);
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
