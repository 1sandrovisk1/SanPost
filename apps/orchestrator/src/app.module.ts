import { PostWorkflowMigrationActivity } from './activities/post-workflow-migration.activity';
import { SharedAutomationsModule } from '@gitroom/nestjs-libraries/integrations/automations/shared-automations.module';
import { SharedFlowActivity } from './activities/shared-flow.activity';
import { Module } from '@nestjs/common';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { getTemporalModule } from '@gitroom/nestjs-libraries/temporal/temporal.module';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { AutopostActivity } from '@gitroom/orchestrator/activities/autopost.activity';
import { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';
import { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';
import { HealthController } from '@gitroom/orchestrator/health.controller';
import { FlowActivity } from '@gitroom/orchestrator/activities/flow.activity';
import { RepostActivity } from '@gitroom/orchestrator/activities/repost.activity';

const activities = [
  PostWorkflowMigrationActivity,
  PostActivity,
  // a atividade (nao o service) e o que o autoPostWorkflow chama: com o
  // service aqui o `autoPost` nao era registrado no worker (upstream d883bfa1)
  AutopostActivity,
  EmailActivity,
  IntegrationsActivity,
  FlowActivity,
  SharedFlowActivity,
  RepostActivity,
];
@Module({
  imports: [
    DatabaseModule,
    SharedAutomationsModule,
    getTemporalModule(true, require.resolve('./workflows'), activities),
  ],
  controllers: [HealthController],
  providers: [...activities],
  get exports() {
    return [...this.providers, ...this.imports];
  },
})
export class AppModule {}
