import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

/**
 * In-process event bus for phase 0-2. Swap for a real broker (NATS/Kafka)
 * by replacing this module's export once a module needs to run as a
 * separate deployable — nothing outside this file should need to change,
 * since publishers/subscribers only ever depend on DomainEvent names.
 */
@Module({
  imports: [EventEmitterModule.forRoot()],
  exports: [EventEmitterModule],
})
export class DomainEventsModule {}
