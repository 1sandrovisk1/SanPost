import { validMessengerEvent } from '../../../integrations/automations/facebook-messenger-webhook';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CredentialService } from '../credentials/credential.service';
import { ScheduledPostsService } from '../scheduled-automations/scheduled-posts.service';
import { Injectable, Optional } from '@nestjs/common';
import { SharedFlowsRepository } from './shared-flows.repository';
import type { CommentEvent } from '../../../dtos/flows/flow-v2.dto';
@Injectable()
export class SharedFlowEventsService {
  constructor(
    private readonly repository: SharedFlowsRepository,
    private readonly credentials: CredentialService,
    @Optional() private readonly scheduled?: ScheduledPostsService
  ) {}
  async receiveInstagram(
    event: CommentEvent,
    raw: Buffer | undefined,
    signature: string | undefined
  ) {
    if (event.eventType === 'messenger_message') return [];
    if (
      !Buffer.isBuffer(raw) ||
      raw.length > 1024 * 1024 ||
      !/^sha256=[a-f0-9]{64}$/.test(signature || '')
    )
      return [];
    const integration = await this.repository.integration(
      event,
      event.integrationId
    );
    if (
      integration.internalId !== event.remoteAccountId ||
      !['instagram', 'instagram-standalone'].includes(
        integration.providerIdentifier
      )
    )
      return [];
    const credentials = await this.credentials.getRawShared(
      event.organizationId,
      'facebook',
      event.profileId
    );
    const secrets = [
      credentials?.clientSecret || process.env.FACEBOOK_APP_SECRET,
      credentials?.instagramAppSecret || process.env.INSTAGRAM_APP_SECRET,
    ].filter((v): v is string => !!v);
    const verified = secrets.some((secret) =>
      timingSafeEqual(
        Buffer.from(signature!.slice(7), 'hex'),
        createHmac('sha256', secret).update(raw).digest()
      )
    );
    return verified ? this.receive(event) : [];
  }
  async receive(event: CommentEvent) {

    if (
      process.env.SHARED_AUTOMATION_TEST_INTEGRATION &&
      event.integrationId !== process.env.SHARED_AUTOMATION_TEST_INTEGRATION
    )
      return [];
    if (event.eventType === 'messenger_message') {
      if (
        !event.profileId ||
        !event.organizationId ||
        !validMessengerEvent(event)
      )
        return [];
      return process.env.SHARED_AUTOMATIONS_ENABLED === 'true' ? this.repository.ingest(event) : [];
    }
    if (event.eventType && event.eventType !== 'comment_on_post') return [];
    if (
      !event.profileId ||
      !event.organizationId ||
      !['facebook', 'instagram'].includes(event.platform) ||
      !Number.isFinite(event.occurredAt) ||
      event.occurredAt <= 0 ||
      event.occurredAt > Date.now() + 60000 ||
      [
        event.remoteAccountId,
        event.externalEventId,
        event.externalPostId,
        event.externalActorId,
      ].some(
        (id) =>
          typeof id !== 'string' ||
          !/^\d+(?:_\d+)?$/.test(id) ||
          id.length > 100
      ) ||
      event.externalActorId === event.remoteAccountId ||
      typeof event.text !== 'string' ||
      event.text.length > 10000
    )
      return [];
    await this.scheduled?.capture(event);
    return process.env.SHARED_AUTOMATIONS_ENABLED === 'true' ? this.repository.ingest(event) : [];
  }
}
