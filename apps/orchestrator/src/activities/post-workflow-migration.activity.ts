import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { PostWorkflowMigrationService } from '@gitroom/nestjs-libraries/database/prisma/posts/post-workflow-migration.service';
import { withHeartbeat } from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';

@Injectable()
@Activity()
export class PostWorkflowMigrationActivity {
  constructor(private readonly migration: PostWorkflowMigrationService) {}

  @ActivityMethod()
  migratePostWorkflowBatch(cursor?: string) {
    return withHeartbeat(() => this.migration.migrateBatch(cursor));
  }
}
