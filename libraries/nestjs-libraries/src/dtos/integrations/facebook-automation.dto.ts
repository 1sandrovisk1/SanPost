import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CompleteFacebookAutomationDto {
  @IsString()
  @Matches(/^fbauto_[a-f0-9]{64}$/)
  state: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  code: string;
}

export type FacebookSetupStage =
  | 'AUTHORIZATION_REQUIRED'
  | 'CALLBACK_REQUIRED'
  | 'CALLBACK_CONFLICT'
  | 'RECEIVING_READY'
  | 'CHECK_REQUIRED'
  | 'CHECK_FAILED';
export interface FacebookSetupStatus {
  stage: FacebookSetupStage;
  checkedAt: string;
  reasons: string[];
  missingPermissions: string[];
  automaticRepliesAvailable: false;
  tokenExpiresAt?: string | null;
  dataAccessExpiresAt?: string | null;
  noScheduledExpiry?: boolean;
  /** Historical confirmation only; never an authorization decision. */
  lastReadyAt?: string;
}
export interface FacebookAppWebhookView {
  appId: string;
  callbackUrl: string;
  verifyToken: string | null;
  /** Stored compatible authorization in this profile; not a live Meta check. */
  authorizationRequired: boolean;
}

export interface FacebookAuthorization {
  source: 'FACEBOOK_LOGIN' | 'SYSTEM_USER';
  systemUserId?: string;
  authorizedAt?: string;
  tokenExpiresAt?: string | null;
  dataAccessExpiresAt?: string | null;
  noScheduledExpiry?: boolean;
}

export interface FacebookSetupView {
  systemUserConfigured?: boolean;
  authorization?: FacebookAuthorization;
  integrationId: string;
  pageId: string;
  appId: string;
  callbackUrl: string;
  verifyToken: string | null;
  authorized: boolean;
  status: FacebookSetupStatus | null;
  receipt: { receivedAt: string; commentId: string; postId: string } | null;
}

export class SendFacebookPrivateReplyTestDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  revision: string;
}
export interface FacebookPrivateReplyTestResult {
  status: 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';
  remoteId?: string;
  code?: number;
  subcode?: number;
  updatedAt?: string;
}
export type FacebookPrivateReplyTestView =
  | { available: false }
  | {
      available: true;
      pageId: string;
      postId: string;
      commentId: string;
      text: string;
      revision: string | null;
      canSend: boolean;
      blockedReason: 'RECEIPT_REQUIRED' | null;
      result: FacebookPrivateReplyTestResult | null;
    };
