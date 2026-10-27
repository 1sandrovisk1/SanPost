import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { SharedFlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/shared-flows.service';
import { SharedFlowsRepository } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/shared-flows.repository';
@Injectable()
@Activity()
export class SharedFlowActivity {
  constructor(
    private readonly service: SharedFlowsService,
    private readonly repository: SharedFlowsRepository
  ) {}
  @ActivityMethod() async sharedPendingDispatches() {
    if (!this.service.enabled()) return [];
    return (await this.repository.pendingDispatches()).map((d) => ({
      id: d.id,
      executionId: d.executionId,
    }));
  }
  @ActivityMethod() async sharedDispatched(id: string) {
    await this.repository.dispatched(id);
  }
  @ActivityMethod() async sharedStart(id: string) {
    return this.service.enabled() ? this.service.startExecution(id) : null;
  }
  @ActivityMethod() async sharedDeliver(id: string, key: string) {
    return this.service.enabled() ? this.service.deliver(id, key) : 'CANCELLED';
  }
  @ActivityMethod() async sharedFinish(
    id: string,
    status: string,
    error?: string
  ) {
    await this.service.finish(id, status, error);
  }
}
