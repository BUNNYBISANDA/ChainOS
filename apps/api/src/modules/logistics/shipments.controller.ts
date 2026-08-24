import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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
  list() {
    return this.shipments.list();
  }

  @Post(":id/dispatch")
  @RequirePermissions("shipment:update")
  dispatch(@Param("id") id: string) {
    return this.shipments.dispatch(id);
  }

  @Post(":id/deliver")
  @RequirePermissions("shipment:update")
  deliver(@Param("id") id: string) {
    return this.shipments.deliver(id);
  }
}
