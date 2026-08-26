import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CommonModule } from "./common/common.module";
import { DomainEventsModule } from "./common/events/events.module";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { AuthMiddleware } from "./common/auth/auth.middleware";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { IamModule } from "./modules/iam/iam.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { ProcurementModule } from "./modules/procurement/procurement.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { FulfillmentModule } from "./modules/fulfillment/fulfillment.module";
import { LogisticsModule } from "./modules/logistics/logistics.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";

@Module({
  imports: [
    CommonModule,
    DomainEventsModule,
    IamModule,
    CatalogModule,
    ProcurementModule,
    InventoryModule,
    FulfillmentModule,
    LogisticsModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: PermissionsGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
    consumer
      .apply(AuthMiddleware)
      .exclude(
        { path: "auth/login", method: RequestMethod.POST },
        { path: "auth/refresh", method: RequestMethod.POST },
        { path: "auth/logout", method: RequestMethod.POST },
      )
      .forRoutes("*");
  }
}
