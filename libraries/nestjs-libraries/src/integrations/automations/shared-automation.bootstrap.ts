import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { WorkflowIdConflictPolicy } from '@temporalio/client';
@Injectable()
export class SharedAutomationBootstrap
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private starting = false;
  private readonly logger = new Logger(SharedAutomationBootstrap.name);
  constructor(private readonly temporal: TemporalService) {}
  onApplicationBootstrap() {
    if (process.env.SHARED_AUTOMATIONS_ENABLED !== 'true') return;
    void this.ensure();
    this.timer = setInterval(() => {
      void this.ensure();
    }, 30000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async ensure() {
    if (this.starting) return;
    this.starting = true;
    try {
      await this.temporal.client
        .getRawClient()
        .workflow.start('automationDispatchWorkflow', {
          taskQueue: 'main',
          workflowId: 'comment-automation-dispatch-v2',
          args: [],
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        });
    } catch {
      this.logger.warn(
        'Shared automation dispatcher unavailable; persisted events remain pending.'
      );
    } finally {
      this.starting = false;
    }
  }
}
