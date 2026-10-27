import { BlueskyProvider } from './bluesky.provider';
import { LinkedinProvider } from './linkedin.provider';
import { MastodonProvider } from './mastodon.provider';
import { PinterestProvider } from './pinterest.provider';
import { SlackProvider } from './slack.provider';
import { ThreadsProvider } from './threads.provider';
import { TwitchProvider } from './twitch.provider';
import { VkProvider } from './vk.provider';
import { WhopProvider } from './whop.provider';
import { WordpressProvider } from './wordpress.provider';

// limites de envios simultaneos por provider (upstream 4e55a959); o Temporal
// usa este valor para dimensionar a fila de cada canal
describe('maxConcurrentJob dos providers', () => {
  it.each([
    ['bluesky', new BlueskyProvider(), 6],
    ['linkedin', new LinkedinProvider(), 8],
    ['mastodon', new MastodonProvider(), 10],
    ['pinterest', new PinterestProvider(), 10],
    ['slack', new SlackProvider(), 10],
    ['threads', new ThreadsProvider(), 20],
    ['twitch', new TwitchProvider(), 5],
    ['vk', new VkProvider(), 5],
    ['whop', new WhopProvider(), 3],
    ['wordpress', new WordpressProvider(), 8],
  ])('%s usa o limite do upstream', (_name, provider, expected) => {
    expect(provider.maxConcurrentJob).toBe(expected);
  });
});
