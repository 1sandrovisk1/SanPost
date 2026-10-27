'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FC } from 'react';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { SlackChannelSelect } from '@gitroom/frontend/components/new-launch/providers/slack/slack.channel.select';
import { SlackDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/slack.dto';
const SlackComponent: FC = () => {
  const form = useSettings();
  return (
    <div>
      <SlackChannelSelect {...form.register('channel')} />
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: SlackComponent,
  CustomPreviewComponent: undefined,
  dto: SlackDto,
  // Midia vai como image blocks (png/jpg/gif); um mp4 faz o chat.postMessage
  // rejeitar a mensagem inteira (upstream #2118) — validado no compositor.
  checkValidity: async (items, _settings, _additionalSettings, t) => {
    const fallback = 'No video support for Slack, only images';
    const hasVideo = items?.some((post) =>
      post?.some((item) => (item?.path?.indexOf?.('mp4') ?? -1) > -1)
    );
    if (hasVideo) {
      return t?.('slack_no_video_support', fallback) ?? fallback;
    }
    return true;
  },
  maximumCharacters: 400000,
});
