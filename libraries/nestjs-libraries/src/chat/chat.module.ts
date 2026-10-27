import { SharedAutomationsModule } from '../integrations/automations/shared-automations.module';
import { Global, Module } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { AgentModelResolver } from '@gitroom/nestjs-libraries/chat/agent.model.resolver';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';

@Global()
@Module({
  imports: [SharedAutomationsModule],
  providers: [MastraService, LoadToolsService, AgentModelResolver, ...toolList],
  get exports() {
    return this.providers;
  },
})
export class ChatModule {}
