import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import dayjs from 'dayjs';
import { Logger } from '@nestjs/common';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
//@ts-ignore
import mime from 'mime';
import TelegramBot from 'node-telegram-bot-api';
import { Integration } from '@prisma/client';
import striptags from 'striptags';

const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN!);
// Added to support local storage posting
const frontendURL = process.env.FRONTEND_URL || 'http://localhost:5000';
const mediaStorage = process.env.STORAGE_PROVIDER || 'local';

// Handshake do /connect: o chat id fica no servidor sob um nonce de uso unico.
const CONNECT_NONCE_TTL_SECONDS = 600;
const connectKey = (nonce: string) => `telegram:connect:${nonce}`;
// cada mensagem /connect so gera um codigo: o update nao e confirmado no
// getUpdates (bot compartilhado), entao sem isso o mesmo /connect poderia ser
// resgatado de novo apos o TTL do nonce
const CONNECT_MESSAGE_USED_TTL_SECONDS = 86400;

export class TelegramProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Telegram has moderate bot API limits
  identifier = 'telegram';
  name = 'Telegram';
  isBetweenSteps = false;
  isWeb3 = true;
  scopes = [] as string[];
  editor = 'html' as const;
  maxLength() {
    return 4096;
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(17);
    return {
      url: state,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    // `code` e o nonce emitido por getBotId — nunca um chat id vindo do
    // cliente (qualquer chamador vincularia qualquer chat do bot compartilhado)
    const nonce = params.code || '';
    const chatId = /^[A-Za-z0-9]{32}$/.test(nonce)
      ? await ioRedis.get(connectKey(nonce))
      : null;
    // so quem apaga a chave consome o nonce (duas chamadas concorrentes)
    if (!chatId || !(await ioRedis.del(connectKey(nonce)))) {
      return 'Invalid credentials';
    }

    const chat = await telegramBot.getChat(chatId);

    if (!chat?.id) {
      return 'No chat found';
    }

    const photo = !chat?.photo?.big_file_id
      ? ''
      : await telegramBot.getFileLink(chat.photo.big_file_id);

    // Modified id to work with chat.username (public groups/channels) or chat.id (private groups/channels) when chat.username is not available
    return {
      id: String(chat.username ? chat.username : chat.id),
      name: chat.title!,
      accessToken: String(chat.id),
      refreshToken: '',
      expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
      picture: photo || '',
      username: chat.username!,
    };
  }

  // Em grupo so um administrador (ou admin anonimo, que posta como o grupo)
  // pode vincular o chat; em canal so admins publicam; em privado, o proprio.
  private async senderIsChatAdmin(
    chatId: number,
    message: TelegramBot.Message
  ): Promise<boolean> {
    if (message.sender_chat?.id === chatId) {
      return true;
    }
    if (message.chat?.type === 'private') {
      return message.from?.id === chatId;
    }
    if (!message.from?.id) {
      return false;
    }
    try {
      const member = await telegramBot.getChatMember(chatId, message.from.id);
      return member.status === 'creator' || member.status === 'administrator';
    } catch (err) {
      return false;
    }
  }

  async getBotId(query: {
    id?: number;
    word: string;
  }): Promise<{ chatId?: string; lastChatId?: number }> {
    // Added allowed_updates Ensure only necessary updates are fetched
    const res = await telegramBot.getUpdates({
      ...(query.id ? { offset: query.id } : {}),
      allowed_updates: ['message', 'channel_post'],
    });
    //message.text is for groups, channel_post.text is for channels
    const match = res.find(
      (p) =>
        (p?.message?.text === `/connect ${query.word}` &&
          p?.message?.chat?.id) ||
        (p?.channel_post?.text === `/connect ${query.word}` &&
          p?.channel_post?.chat?.id)
    );
    // get correct chatId based on the channel type
    const chatId = match?.message?.chat?.id || match?.channel_post?.chat?.id;

    const nextOffset =
      res.length > 0 ? { lastChatId: res[res.length - 1].update_id + 1 } : {};

    const connectMessageKey = chatId
      ? `telegram:connect-used:${chatId}:${
          match?.message?.message_id || match?.channel_post?.message_id
        }`
      : '';
    if (
      chatId &&
      (await ioRedis.set(
        connectMessageKey,
        '1',
        'EX',
        CONNECT_MESSAGE_USED_TTL_SECONDS,
        'NX'
      )) !== 'OK'
    ) {
      return nextOffset;
    }

    if (chatId && match?.message && !(await this.senderIsChatAdmin(chatId, match.message))) {
      await telegramBot
        .sendMessage(
          chatId,
          'Only a group administrator can connect this chat. Ask an administrator to send the /connect command.'
        )
        .catch(() => undefined);
      return nextOffset;
    }

    // prevents the code from running while chatId is still undefined to avoid the error 'ETELEGRAM: 400 Bad Request: chat_id is empty'. the code would still work eventually but console spam is not pretty
    if (chatId) {
      //get the numberic ID of the bot
      const botId = (await telegramBot.getMe()).id;
      // check if the bot is an admin in the chat
      const isAdmin = await this.botIsAdmin(chatId, botId);
      // get the messageId of the message that triggered the connection
      const connectMessageId =
        match?.message?.message_id || match?.channel_post?.message_id;

      if (!isAdmin) {
        // alternatively you can replace this with a console.log if you do not want to inform the user of the bot's admin status
        telegramBot.sendMessage(
          chatId,
          "Connection Successful. I don't have admin privileges to delete these messages, please go ahead and remove them yourself."
        );
      } else {
        // Delete the message that triggered the connection
        await telegramBot.deleteMessage(chatId, connectMessageId);
        // Send success message to the chat
        const successMessage = await telegramBot.sendMessage(
          chatId,
          'Connection Successful. Message will be deleted in 10 seconds.'
        );
        // Delete the success message after 10 seconds
        setTimeout(() => {
          telegramBot
            .deleteMessage(chatId, successMessage.message_id)
            .catch(() => undefined);
        }, 10000);
      }
    }

    if (!chatId) {
      return nextOffset;
    }

    // o frontend recebe so o nonce; authenticate troca pelo chat id
    const nonce = makeSecureId(32);
    await ioRedis.set(
      connectKey(nonce),
      String(chatId),
      'EX',
      CONNECT_NONCE_TTL_SECONDS
    );
    return { chatId: nonce };
  }

  private processMedia(mediaFiles: PostDetails['media']) {
    return (mediaFiles || []).map((media) => {
      let mediaUrl = media.path;
      if (mediaStorage === 'local' && mediaUrl.startsWith(frontendURL)) {
        mediaUrl = mediaUrl.replace(frontendURL, '');
      }
      // node-telegram-bot-api faz upload de QUALQUER caminho local existente
      // que receber: tudo que nao e URL precisa ser arquivo do diretorio de
      // uploads (CVE-2026-115932).
      if (mediaUrl.indexOf('http') !== 0) {
        mediaUrl = this.localMediaPath(mediaUrl);
      }
      //get mime type to pass contentType to telegram api.
      //some photos and videos might not pass telegram api restrictions, so they are sent as documents instead of returning errors
      const mimeType = mime.getType(mediaUrl); // Detect MIME type
      let mediaType: 'photo' | 'video' | 'document';

      if (mimeType?.startsWith('image/')) {
        mediaType = 'photo';
      } else if (mimeType?.startsWith('video/')) {
        mediaType = 'video';
      } else {
        mediaType = 'document';
      }

      return {
        type: mediaType,
        media: mediaUrl,
        fileOptions: {
          filename: media.path.split('/').pop(),
          contentType: mimeType || 'application/octet-stream',
        },
      };
    });
  }

  private async sendMessage(
    accessToken: string,
    message: PostDetails,
    replyToMessageId?: number
  ): Promise<number | null> {
    try {
      return await this.sendMessageInternal(accessToken, message, replyToMessageId);
    } catch (error: any) {
      // Um 400 do Telegram e rejeicao permanente desta requisicao (legenda
      // longa, midia que o Telegram nao conseguiu baixar...): retentar nunca
      // resolve, entao vai para o usuario como BadBody (upstream #2140).
      const body = error?.response?.body;
      if (error?.code === 'ETELEGRAM' && body?.error_code === 400) {
        const description = (body.description || '').replace('Bad Request: ', '');
        throw new BadBody(
          this.identifier,
          JSON.stringify(body),
          Buffer.from(JSON.stringify(body)),
          description === 'failed to get HTTP URL content'
            ? 'Telegram could not download your media file, please check the file and try again'
            : `Telegram rejected the post: ${description}`
        );
      }
      throw error;
    }
  }

  private async sendMessageInternal(
    accessToken: string,
    message: PostDetails,
    replyToMessageId?: number
  ): Promise<number | null> {
    let messageId: number | null = null;
    const mediaFiles = message.media || [];
    const text = striptags(message.message || '', ['u', 'strong', 'p'])
      .replace(/<strong>/g, '<b>')
      .replace(/<\/strong>/g, '</b>')
      .replace(/<p>(.*?)<\/p>/g, '$1\n');

    const processedMedia = this.processMedia(mediaFiles);

    // if there's no media, bot sends a text message only
    if (processedMedia.length === 0) {
      const response = await telegramBot.sendMessage(accessToken, text, {
        parse_mode: 'HTML',
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      });
      messageId = response.message_id;
    }
    // if there's only one media, bot sends the media with the text message as caption
    else if (processedMedia.length === 1) {
      const media = processedMedia[0];
      const options = {
        caption: text,
        parse_mode: 'HTML' as const,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      };
      const response =
        media.type === 'video'
          ? await telegramBot.sendVideo(
              accessToken,
              media.media,
              options,
              media.fileOptions
            )
          : media.type === 'photo'
          ? await telegramBot.sendPhoto(
              accessToken,
              media.media,
              options,
              media.fileOptions
            )
          : await telegramBot.sendDocument(
              accessToken,
              media.media,
              options,
              media.fileOptions
            );
      messageId = response.message_id;
    }
    // if there are multiple media, bot sends them as a media group - max 10 media per group - with the text as a caption (if there are more than 1 group, the caption will only be sent with the first group)
    else {
      const mediaGroups = this.chunkMedia(processedMedia, 10);
      for (let i = 0; i < mediaGroups.length; i++) {
        const mediaGroup = mediaGroups[i].map((m, index) => ({
          type: m.type === 'document' ? 'document' : m.type, // Documents are not allowed in media groups
          media: m.media,
          caption: i === 0 && index === 0 ? text : undefined,
          parse_mode: 'HTML',
        }));

        const response = await telegramBot.sendMediaGroup(
          accessToken,
          mediaGroup as any[],
          {
            ...(replyToMessageId && i === 0
              ? { reply_to_message_id: replyToMessageId }
              : {}),
          }
        );
        if (i === 0) {
          messageId = response[0].message_id;
        }
      }
    }

    return messageId;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;

    const messageId = await this.sendMessage(accessToken, firstPost);

    // for private groups/channels message.id is undefined so the link generated by Postiz will be unusable "https://t.me/c/undefined/16"
    // to avoid that, we use accessToken instead of message.id and we generate the link manually removing the -100 from the start.
    if (messageId) {
      return [
        {
          id: firstPost.id,
          postId: String(messageId),
          releaseURL: `https://t.me/${
            id !== 'undefined' ? id : `c/${accessToken.replace('-100', '')}`
          }/${messageId}`,
          status: 'completed',
        },
      ];
    }

    return [];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const replyToId = Number(lastCommentId || postId);

    const messageId = await this.sendMessage(accessToken, commentPost, replyToId);

    if (messageId) {
      return [
        {
          id: commentPost.id,
          postId: String(messageId),
          releaseURL: `https://t.me/${
            id !== 'undefined' ? id : `c/${accessToken.replace('-100', '')}`
          }/${messageId}`,
          status: 'completed',
        },
      ];
    }

    return [];
  }
  // chunkMedia is used to split media into groups of "size". 10 is used here because telegram api allows a maximum of 10 media per group
  private chunkMedia(media: { type: string; media: string }[], size: number) {
    const result = [];
    for (let i = 0; i < media.length; i += size) {
      result.push(media.slice(i, i + size));
    }
    return result;
  }

  async botIsAdmin(chatId: number, botId: number): Promise<boolean> {
    try {
      const chatMember = await telegramBot.getChatMember(chatId, botId);

      if (
        chatMember.status === 'administrator' ||
        chatMember.status === 'creator'
      ) {
        const permissions = chatMember.can_delete_messages;
        return !!permissions; // Return true if bot can delete messages
      }

      return false;
    } catch (error) {
      // so o resumo: o erro da Bot API carrega a URI com o token do bot
      Logger.warn(
        `bot privileges check failed: ${summarizeError(error)}`,
        'TelegramProvider'
      );
      return false;
    }
  }
}
