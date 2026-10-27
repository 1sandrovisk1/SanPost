import { HttpException, Injectable } from '@nestjs/common';
import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { FileProofLedger } from './meta-automation-proof';
import { MetaAutomationDelivery, record } from './meta-automation-graph.client';
import type { FacebookPrivateReplyTestResult } from '../../dtos/integrations/facebook-automation.dto';

export interface FacebookProofConfig {
  organizationId: string;
  profileId: string;
  integrationId: string;
  appId: string;
  pageId: string;
  postId: string;
  commentId: string;
  text: string;
  ledgerId: string;
}

/** Opt-in, single-instance homologation only. The host bind mount is shared with the proof CLI. */
@Injectable()
export class FacebookAutomationProofRepository {
  private async readFile(path: string, limit: number) {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > limit) throw Error('INVALID_FILE');
      return {
        text: await file.readFile('utf8'),
        updatedAt: info.mtime.toISOString(),
      };
    } finally {
      await file.close();
    }
  }
  async config(): Promise<FacebookProofConfig | null> {
    const path = process.env.FACEBOOK_AUTOMATION_PROOF_CONFIG;
    if (!path) return null;
    try {
      if (!isAbsolute(path)) throw Error();
      const raw = record(JSON.parse((await this.readFile(path, 16384)).text));
      const keys = [
        'organizationId',
        'profileId',
        'integrationId',
        'appId',
        'pageId',
        'postId',
        'commentId',
        'text',
        'ledgerId',
      ] as const;
      if (
        keys.some(
          (key) => typeof raw[key] !== 'string' || !(raw[key] as string).trim()
        )
      )
        throw Error();
      const config = Object.fromEntries(
        keys.map((key) => [key, raw[key]])
      ) as unknown as FacebookProofConfig;
      if (
        !/^[a-f0-9]{64}$/.test(config.ledgerId) ||
        !/^\d{1,32}$/.test(config.appId) ||
        !/^\d{1,32}$/.test(config.pageId) ||
        !/^\d+_\d+$/.test(config.postId) ||
        !/^\d+_\d+$/.test(config.commentId) ||
        !config.postId.startsWith(`${config.pageId}_`) ||
        !config.commentId.startsWith(`${config.postId.split('_')[1]}_`) ||
        config.text.length > 2000
      )
        throw Error();
      return config;
    } catch {
      throw new HttpException('PROOF_CONFIGURATION_UNAVAILABLE', 503);
    }
  }
  private async ledger(config: FacebookProofConfig) {
    try {
      const directory = process.env.FACEBOOK_AUTOMATION_PROOF_DIR;
      if (!directory || !isAbsolute(directory)) throw Error();
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw Error();
      if (
        (
          await this.readFile(join(directory, '.ledger-id'), 128)
        ).text.trim() !== config.ledgerId
      )
        throw Error();
      // Never initialize storage here: a missing mount must fail before reserve/POST.
      return new FileProofLedger(directory);
    } catch {
      throw new HttpException('PROOF_STORAGE_UNAVAILABLE', 503);
    }
  }
  async read(
    config: FacebookProofConfig
  ): Promise<FacebookPrivateReplyTestResult | null> {
    const ledger = await this.ledger(config);
    let file: { text: string; updatedAt: string };
    try {
      file = await this.readFile(
        ledger.pathFor(config.pageId, config.commentId),
        8192
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new HttpException('PROOF_STORAGE_UNAVAILABLE', 503);
    }
    try {
      const lines = file.text.trim().split('\n');
      if (record(JSON.parse(lines[0])).status !== 'SENDING' || lines.length > 2)
        throw Error();
      if (lines.length === 1)
        return { status: 'SENDING', updatedAt: file.updatedAt };
      const result = safeProofResult(JSON.parse(lines[1]));
      return { ...result, updatedAt: file.updatedAt };
    } catch {
      return { status: 'UNKNOWN', updatedAt: file.updatedAt };
    }
  }
  async reserve(config: FacebookProofConfig) {
    await (await this.ledger(config)).reserve(config.pageId, config.commentId);
  }
  async complete(
    config: FacebookProofConfig,
    delivery: MetaAutomationDelivery
  ) {
    await (
      await this.ledger(config)
    ).complete(config.pageId, config.commentId, delivery);
  }
}

export function safeProofResult(
  value: unknown
): FacebookPrivateReplyTestResult {
  const raw = record(value);
  if (
    raw.status === 'SENT' &&
    typeof raw.remoteId === 'string' &&
    /^[A-Za-z0-9_.:=-]{1,512}$/.test(raw.remoteId)
  )
    return { status: 'SENT', remoteId: raw.remoteId };
  const error = record(raw.error);
  return {
    status: raw.status === 'FAILED' ? 'FAILED' : 'UNKNOWN',
    ...(Number.isSafeInteger(error.code) ? { code: error.code as number } : {}),
    ...(Number.isSafeInteger(error.subcode)
      ? { subcode: error.subcode as number }
      : {}),
  };
}
