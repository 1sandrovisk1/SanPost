import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import FormData from 'form-data';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { DribbbleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/dribbble.dto';
import mime from 'mime-types';
import { DiscordDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/discord.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';

export class DribbbleProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Dribbble has moderate API limits
  identifier = 'dribbble';
  name = 'Dribbble';
  isBetweenSteps = false;
  scopes = ['public', 'upload'];
  editor = 'normal' as const;
  maxLength() {
    return 40000;
  }
  dto = DribbbleDto;

  // O Dribbble nao emite refresh token (authenticate devolve ''): token vazio
  // leva o canal ao fluxo de "nao renovavel" (desconecta e pede reconexao),
  // como Hashnode/Mastodon. A versao anterior era copia do fluxo do Pinterest
  // sandbox e mandaria credenciais do Pinterest para outro host.
  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
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

  @Tool({ description: 'Teams list', dataSchema: [] })
  async teams(accessToken: string) {
    const { teams } = await (
      await this.fetch('https://api.dribbble.com/v2/user', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return (
      teams?.map((team: any) => ({
        id: team.id,
        name: team.name,
      })) || []
    );
  }

  async generateAuthUrl() {
    const state = makeSecureId(6);
    return {
      url: `https://dribbble.com/oauth/authorize?client_id=${
        process.env.DRIBBBLE_CLIENT_ID
      }&redirect_uri=${encodeURIComponent(
        `${process.env.FRONTEND_URL}/integrations/social/dribbble`
      )}&response_type=code&scope=${this.scopes.join('+')}&state=${state}`,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh: string;
  }) {
    const { access_token, scope } = await (
      await this.fetch(
        `https://dribbble.com/oauth/token?client_id=${process.env.DRIBBBLE_CLIENT_ID}&client_secret=${process.env.DRIBBBLE_CLIENT_SECRET}&code=${params.code}&redirect_uri=${process.env.FRONTEND_URL}/integrations/social/dribbble`,
        {
          method: 'POST',
        }
      )
    ).json();

    this.checkScopes(this.scopes, scope);

    const { id, name, avatar_url, login } = await (
      await this.fetch('https://api.dribbble.com/v2/user', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      id: id,
      name,
      accessToken: access_token,
      refreshToken: '',
      expiresIn: 999999999,
      picture: avatar_url,
      username: login,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<DribbbleDto>[]
  ): Promise<PostResponse[]> {
    const { data, status } = await this.getSsrfSafeAxios().get(
      postDetails?.[0]?.media?.[0]?.path!,
      {
        responseType: 'stream',
      }
    );

    const slash = postDetails?.[0]?.media?.[0]?.path.split('/').at(-1);

    const formData = new FormData();
    formData.append('image', data, {
      filename: slash,
      contentType: mime.lookup(slash!) || '',
    });

    formData.append('title', postDetails[0].settings.title);
    formData.append('description', postDetails[0].message);

    // 4xx do Dribbble (shot invalida, sem permissao) e rejeicao permanente:
    // BadBody com a mensagem da API em vez de "Unknown Error" (upstream #2134).
    let data2;
    try {
      data2 = await this.getSsrfSafeAxios().post(
        'https://api.dribbble.com/v2/shots',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    } catch (err: any) {
      const status = err?.response?.status;
      // 401 = token revogado: segue o fluxo de refresh/desconexao do fork
      if (status === 401) {
        throw new RefreshToken(
          this.identifier,
          JSON.stringify(err?.response?.data ?? {}),
          '{}',
          'Dribbble rejected the connected account, please reconnect the channel'
        );
      }
      if (status >= 400 && status < 500 && status !== 429) {
        throw new BadBody(
          this.identifier,
          JSON.stringify(err?.response?.data ?? {}),
          '{}',
          err?.response?.data?.message ||
            `Dribbble rejected the shot with status ${status}`
        );
      }
      throw err;
    }

    const location = data2.headers['location'];
    const newId = location.split('/').at(-1);

    return [
      {
        id: postDetails?.[0]?.id,
        status: 'completed',
        postId: newId,
        releaseURL: `https://dribbble.com/shots/${newId}`,
      },
    ];
  }

  analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    return Promise.resolve([]);
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    // Dribbble doesn't provide detailed post-level analytics via their API
    return [];
  }
}
