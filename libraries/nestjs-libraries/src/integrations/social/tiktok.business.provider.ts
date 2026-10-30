import {
  AnalyticsData,
  AuthTokenDetails,
  ClientInformation,
  MediaContent,
  PendingCheckResponse,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import dayjs from 'dayjs';
import sharp from 'sharp';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import {
  BadBody,
  PublishedWithError,
  RefreshToken,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { TikTokBusinessDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.business.dto';
import {
  isTikTokPhotoPost,
  TIKTOK_PHOTO_TITLE_LIMIT,
  TIKTOK_VIDEO_CAPTION_LIMIT,
  tiktokCaptionTooLong,
} from '@gitroom/nestjs-libraries/integrations/social/tiktok.caption';
import { timer } from '@gitroom/helpers/utils/timer';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';

// O TikTok recusa o post de fotos inteiro quando uma imagem passa disso no lado
// menor, e o status so diz `picture_size_check_failed`, sem apontar qual.
const TIKTOK_MAX_IMAGE_SHORT_SIDE = 1080;
// Leitura de uma imagem para a pre-checagem: imagem lenta, grande demais ou
// inacessivel conta como "nao mensuravel" e nao bloqueia o post (o TikTok
// decide). O orcamento total limita o tempo da checagem dentro da activity (o
// `post()` do V102 precisa terminar antes do timeout de 10 minutos).
const IMAGE_CHECK_TIMEOUT_MS = 20_000;
const IMAGE_CHECK_BUDGET_MS = 60_000;
// o TikTok aceita foto de ate 20 MB; acima disso nem vale baixar para medir
const IMAGE_CHECK_MAX_BYTES = 25 * 1024 * 1024;

// Porte do provider TikTok for Business do Postiz (upstream 4ace3a7a e
// seguintes, base em upstream/main de 28/10/2026). Divergencias do fork, todas
// registradas em docs/planning/upstream-sync-triage-2026-10.md:
// - credenciais por workspace/perfil via ClientInformation (env so de fallback);
// - sem `Disconnect`/MIGRATE_PROVIDERS (o fork nao tem a classe nem a migracao
//   de canal; este provider nunca classifica um erro como disconnect);
// - legenda e pre-checagem de imagem antes do publish (o fork nao tem o
//   checkValidity do servidor; o compositor faz a mesma checagem no cliente);
// - leituras de analytics e resolveReleaseId via analyticsFetch (pitfall 13).
@Rules(
  [
    'TikTok Business can have one video or one picture or multiple pictures (up to 35), it cannot be without an attachment.',
    'content_posting_method=DIRECT_POST publishes the post to the account. content_posting_method=UPLOAD does NOT publish: it only saves the media as a draft in the user inbox of the TikTok app, where the user must manually complete and publish it. Use DIRECT_POST unless the user explicitly asks to review or edit the post inside the TikTok app first.',
    'With content_posting_method=UPLOAD, TikTok ignores every setting except the title / post content. Never tell the user that video_made_with_ai, privacy_level, duet, stitch, comment, autoAddMusic, brand_content_toggle or brand_organic_toggle will be applied in UPLOAD mode - they are silently discarded. If the user asks for any of those settings, tell them it requires DIRECT_POST.',
    'video_made_with_ai, duet and stitch apply to video posts only. privacy_level and autoAddMusic apply to photo posts only - the TikTok Business API has no privacy field for video posts, so those settings are discarded when the attachment is a video.',
    'The music setting attaches a commercial music library track (found via the musicSearch function) to a video or photo post, and the location setting tags the post with a location (found via the locationSearch function). Both apply only with content_posting_method=DIRECT_POST. music.audio_volume / music.video_volume (0-100, default 50) apply to video posts only. For photos, autoAddMusic=yes attaches a RANDOM commercial music library track and overrides any music selection - use autoAddMusic=no when the user wants a specific track.',
    'Media is pulled by TikTok from its URL, so the media must be uploaded to the media library and the media domain must be a verified URL property of the TikTok Business app.',
  ].join(' ')
)
export class TiktokBusinessProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'tiktok-business';
  // upstream usa 'TikTok' porque esconde o nativo via HIDDEN_PROVIDERS; no fork
  // os dois aparecem em "Adicionar canal" e precisam de nomes distintos
  name = 'TikTok Business';
  isBetweenSteps = false;
  convertToJPEG = true;
  scopes = [
    'user.info.basic',
    'user.info.username',
    'user.info.stats',
    'video.list',
    'video.upload',
    'video.publish',
  ];
  // sem maxConcurrentJob (o upstream usa 10000): identificador com '-' nao cria
  // fila propria no fork, as activities rodam na fila 'tiktok' com o limite do
  // provider nativo
  dto = TikTokBusinessDto;
  editor = 'normal' as const;
  maxLength() {
    // legenda de video da Business API (fotos aceitam 4.000, ver tiktok.caption)
    return TIKTOK_VIDEO_CAPTION_LIMIT;
  }

  private baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';

  // O portal de desenvolvedores do TikTok so aceita redirect com "/" no fim
  // para apps Business: a barra nao e cosmetica, o redirect_uri da troca do
  // codigo precisa ser igual ao cadastrado.
  private redirectUri() {
    return `${
      process?.env?.FRONTEND_URL?.indexOf('https') === -1
        ? 'https://redirectmeto.com/'
        : ''
    }${process?.env?.FRONTEND_URL}/integrations/social/tiktok-business/`;
  }

  // App do workspace/perfil (Configuracoes > Credenciais > TikTok Business),
  // sempre como par: o IntegrationManager ja cai no env quando nao ha
  // credencial salva, entao o env aqui so cobre chamada sem ClientInformation
  // (caminho legado) e nunca mistura o client_id do perfil com o segredo da
  // instancia.
  private appCredentials(clientInformation?: ClientInformation) {
    if (clientInformation?.client_id) {
      return {
        clientId: clientInformation.client_id,
        clientSecret: clientInformation.client_secret || '',
      };
    }
    return {
      clientId: process.env.TIKTOK_BUSINESS_CLIENT_ID || '',
      clientSecret: process.env.TIKTOK_BUSINESS_CLIENT_SECRET || '',
    };
  }

  override handleErrors(body: string):
    | {
        type: 'refresh-token' | 'bad-body';
        value: string;
      }
    | undefined {
    // A Business API responde HTTP 200 com `code` diferente de zero: o erro de
    // token e detectado pelo corpo, nao pelo status.
    if (
      body.indexOf('access_token_invalid') > -1 ||
      body.indexOf('Access token is incorrect') > -1 ||
      body.indexOf('Access token has expired') > -1 ||
      // code 40000 visto em /business/video/publish/ (upstream 97ee8b9f)
      body.indexOf('The access token is invalid') > -1 ||
      body.indexOf('auth_removed') > -1
    ) {
      return {
        type: 'refresh-token' as const,
        value:
          'Access token invalid, please re-authenticate your TikTok account',
      };
    }

    if (
      body.indexOf('rate_limit_exceeded') > -1 ||
      body.indexOf('Too many requests') > -1
    ) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok API rate limit exceeded, please try again later',
      };
    }

    if (body.indexOf('file_format_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'File format is invalid, please check video specifications',
      };
    }

    if (body.indexOf('duration_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Video duration is invalid, please check video specifications',
      };
    }

    if (body.indexOf('frame_rate_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Video frame rate is invalid, please check video specifications',
      };
    }

    if (body.indexOf('video_pull_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Failed to pull video from URL, please check the URL',
      };
    }

    if (body.indexOf('photo_pull_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Failed to pull photo from URL, please check the URL',
      };
    }

    if (body.indexOf('spam_risk_user_banned_from_posting') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Account banned from posting, please check TikTok account status',
      };
    }

    if (body.indexOf('spam_risk_text') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok detected potential spam in the post text',
      };
    }

    if (body.indexOf('spam_risk_too_many_posts') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'TikTok says your daily post limit reached, please try again tomorrow',
      };
    }

    if (body.indexOf('spam_risk') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok detected potential spam',
      };
    }

    // Reconectar nao zera uma cota diaria: continua post com erro (o upstream
    // so usa 'disconnect' no app legado, com destino de migracao).
    if (body.indexOf('reached_active_user_cap') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok daily user limit reached, please try again tomorrow',
      };
    }

    if (body.indexOf('url_ownership_unverified') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'The media domain is not a verified URL property of the TikTok app',
      };
    }

    if (body.indexOf('publish_cancelled') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok cancelled the upload, please try again',
      };
    }

    if (body.indexOf('picture_size_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Media size not supported by TikTok: images up to 1080px on the shorter side, videos at least 360px on both sides',
      };
    }

    if (body.indexOf('invalid_params') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid request parameters, please check content format',
      };
    }

    if (body.indexOf('internal') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'There is a problem with TikTok servers, please try again later',
      };
    }

    if (body.indexOf('TikTok API error') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok API error, please try again',
      };
    }

    return undefined;
  }

  // Todo endpoint da Business API (menos o OAuth) autentica pelo header
  // `Access-Token` e embrulha a resposta em {code, message, data}; erro chega
  // como HTTP 200 com code diferente de zero.
  private async fetchUserInformation(accessToken: string, businessId: string) {
    const information = await (
      await this.fetch(
        `${this.baseUrl}/business/get/?business_id=${encodeURIComponent(
          businessId
        )}&fields=${encodeURIComponent(
          JSON.stringify(['username', 'display_name', 'profile_image'])
        )}`,
        {
          method: 'GET',
          headers: {
            'Access-Token': accessToken,
          },
        }
      )
    ).json();

    // Sem esta checagem a conexao "dava certo" com nome/foto/perfil undefined
    // e criava um canal quebrado.
    if (information?.code !== 0) {
      const asString = JSON.stringify(information);
      const handleError = this.handleErrors(asString);
      throw new BadBody(
        this.identifier,
        asString,
        Buffer.from('{}'),
        handleError?.value ||
          information?.message ||
          'Could not load the TikTok business account'
      );
    }

    return {
      display_name: information.data?.display_name,
      profile_image: information.data?.profile_image,
      username: information.data?.username,
    };
  }

  // clientInformation obrigatorio aqui tambem: o refresh_token foi emitido para
  // o app do perfil; com o app do env o TikTok recusa e o canal pede reconexao.
  async refreshToken(
    refreshToken: string,
    clientInformation?: ClientInformation
  ): Promise<AuthTokenDetails> {
    const { clientId, clientSecret } = this.appCredentials(clientInformation);
    const response = await (
      await fetch(`${this.baseUrl}/tt_user/oauth2/refresh_token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      })
    ).json();

    // Falha de OAuth tambem chega como HTTP 200 sem data: sem esta checagem o
    // destructure abaixo virava um TypeError sem classificacao.
    if (response?.code !== 0 || !response?.data?.access_token) {
      const asString = JSON.stringify(response);
      const handleError = this.handleErrors(asString);
      throw new BadBody(
        this.identifier,
        asString,
        Buffer.from('{}'),
        handleError?.value ||
          response?.message ||
          'Could not refresh the TikTok access token'
      );
    }

    const { access_token, refresh_token, open_id } = response.data;

    const { display_name, profile_image, username } =
      await this.fetchUserInformation(access_token, open_id);

    return {
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      accessToken: access_token,
      // open_id fica como veio: e o business_id de toda chamada da Business
      // API, nao pode ser normalizado (o nativo remove os '-').
      id: open_id,
      name: display_name,
      picture: profile_image || '',
      username: username,
    };
  }

  async generateAuthUrl(clientInformation?: ClientInformation) {
    // segredo de OAuth: CSPRNG (CVE-2026-94456)
    const state = makeSecureId(32);
    const { clientId } = this.appCredentials(clientInformation);

    return {
      url:
        'https://www.tiktok.com/v2/auth/authorize/' +
        `?client_key=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(this.redirectUri())}` +
        `&state=${state}` +
        `&response_type=code` +
        `&disable_auto_auth=1` +
        `&scope=${encodeURIComponent(this.scopes.join(','))}`,
      codeVerifier: state,
      state,
    };
  }

  async authenticate(
    params: {
      code: string;
      codeVerifier: string;
      refresh?: string;
    },
    clientInformation?: ClientInformation
  ) {
    // Redirect sem auth_code (consentimento recusado ou erro no TikTok) ia ate
    // o endpoint de token e falhava como 40002 "Please provide the auth_code",
    // escondendo a causa real (upstream 15c4ce19).
    if (!params.code) {
      throw new BadBody(
        this.identifier,
        JSON.stringify({ reason: 'no auth_code in the redirect' }),
        Buffer.from('{}'),
        'TikTok did not return an authorization code, the authorization was not completed'
      );
    }

    const { clientId, clientSecret } = this.appCredentials(clientInformation);
    const response = await (
      await fetch(`${this.baseUrl}/tt_user/oauth2/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          auth_code: params.code,
          redirect_uri: this.redirectUri(),
        }),
      })
    ).json();

    // Mesmo envelope HTTP 200 + code: auth_code expirado ou redirect_uri
    // diferente precisa mostrar o motivo do TikTok, nao um TypeError.
    if (response?.code !== 0 || !response?.data?.access_token) {
      const asString = JSON.stringify(response);
      const handleError = this.handleErrors(asString);
      throw new BadBody(
        this.identifier,
        asString,
        Buffer.from('{}'),
        handleError?.value ||
          response?.message ||
          'Could not authenticate the TikTok business account'
      );
    }

    const { access_token, refresh_token, scope, open_id } = response.data;

    this.checkScopes(this.scopes, scope);

    const { display_name, profile_image, username } =
      await this.fetchUserInformation(access_token, open_id);

    return {
      id: open_id,
      name: display_name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      picture: profile_image || '',
      username: username,
    };
  }

  // Uma unica consulta de status, sem loop nem timer: no workflow V112 o
  // `postPending` devolve `pending` logo apos o publish e o workflow repete esta
  // consulta com timers duraveis, entao uma checagem retentada nunca refaz o
  // publish nem duplica o post. O `post()` (V102) reusa o mesmo metodo.
  async checkPostStatus(
    accessToken: string,
    pendingData: { publishId: string },
    integration: Integration
  ): Promise<PendingCheckResponse> {
    let body: string;
    let post: any;
    try {
      body = await (
        await this.fetch(
          `${this.baseUrl}/business/publish/status/?business_id=${encodeURIComponent(
            integration.internalId
          )}&publish_id=${encodeURIComponent(pendingData.publishId)}`,
          {
            method: 'GET',
            headers: {
              'Access-Token': accessToken,
            },
          },
          '',
          0,
          true
        )
      ).text();
      post = JSON.parse(body);
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }

      // Erro transitorio na consulta: o post pode ja estar no ar, entao segue
      // consultando em vez de falhar; se a API continuar fora, quem chama
      // esgota as consultas e avisa o usuario.
      return { status: 'pending', pendingData };
    }

    // Erro chega como HTTP 200 com code, invisivel para o this.fetch: erro de
    // token vira RefreshToken, o resto e tratado como transitorio.
    if (post?.code !== 0) {
      const asString = JSON.stringify(post);
      const handleError = this.handleErrors(asString);
      if (handleError?.type === 'refresh-token') {
        throw new RefreshToken(
          this.identifier,
          asString,
          '{}',
          handleError.value
        );
      }
      return { status: 'pending', pendingData };
    }

    const { status, reason } = post?.data || {};

    if (status === 'SEND_TO_USER_INBOX') {
      // o id fica 'missing' ate o usuario publicar o rascunho; o share id vai
      // no fragmento da URL para o resolveReleaseId consultar depois
      return {
        status: 'completed',
        releaseURL: `https://www.tiktok.com/messages?lang=en#${pendingData.publishId}`,
        postId: 'missing',
      };
    }

    if (status === 'PUBLISH_COMPLETE') {
      // post_ids pode atrasar ate 3 minutos depois do PUBLISH_COMPLETE e nunca
      // aparece para post nao publico: fica a URL do perfil e o share_id, e o
      // resolveReleaseId corrige depois.
      const publicPostId = this.publicPostId(body);
      const profile = integration.profile;

      // sem perfil (Integration.profile e opcional) a URL ficaria /@/... para
      // sempre: guarda o share_id para o resolveReleaseId corrigir depois
      if (!publicPostId || !profile) {
        return {
          status: 'completed',
          releaseURL: this.profileUrl(integration),
          postId: pendingData.publishId,
        };
      }

      return {
        status: 'completed',
        releaseURL: this.postUrl(profile, pendingData.publishId, publicPostId),
        postId: publicPostId,
      };
    }

    if (status === 'FAILED') {
      const handleError = this.handleErrors(
        `${reason || ''} ${JSON.stringify(post)}`
      );
      throw new BadBody(
        'tiktok-business-error-upload',
        JSON.stringify(post),
        Buffer.from(JSON.stringify(post)),
        handleError?.value ||
          (reason
            ? `TikTok could not publish the post: ${String(reason).slice(0, 200)}`
            : 'TikTok could not publish the post')
      );
    }

    return { status: 'pending', pendingData };
  }

  // UPLOAD nao publica, so deixa a midia como rascunho na caixa de entrada do
  // app; por isso so um UPLOAD explicito o escolhe. Valor ausente publica.
  private contentPostingMethod(
    firstPost: PostDetails<TikTokBusinessDto>
  ): TikTokBusinessDto['content_posting_method'] {
    return firstPost?.settings?.content_posting_method === 'UPLOAD'
      ? 'UPLOAD'
      : 'DIRECT_POST';
  }

  // A Business API e so PULL_FROM_URL: o TikTok baixa a midia da URL, nao ha
  // upload por arquivo/chunk nesses endpoints.
  private buildVideoBody(
    businessId: string,
    firstPost: PostDetails<TikTokBusinessDto>
  ) {
    const isDraft = this.contentPostingMethod(firstPost) === 'UPLOAD';
    const settings = firstPost.settings || ({} as TikTokBusinessDto);

    return {
      business_id: businessId,
      video_url: firstPost?.media?.[0]?.path!,
      ...(firstPost?.media?.[0]?.thumbnail
        ? { custom_thumbnail_url: firstPost?.media?.[0]?.thumbnail }
        : firstPost?.media?.[0]?.thumbnailTimestamp
        ? { thumbnail_offset: firstPost?.media?.[0]?.thumbnailTimestamp }
        : {}),
      post_info: {
        ...(firstPost.message ? { caption: firstPost.message } : {}),
        // o endpoint de video nao tem privacy_level: diferente das fotos, o
        // video sai com o padrao da conta
        is_brand_organic: this.assetBoolean(settings.brand_organic_toggle),
        is_branded_content: this.assetBoolean(settings.brand_content_toggle),
        ...(isDraft
          ? { upload_to_draft: true }
          : {
              disable_comment: !this.assetBoolean(settings.comment),
              disable_duet: !this.assetBoolean(settings.duet),
              disable_stitch: !this.assetBoolean(settings.stitch),
              is_ai_generated: this.assetBoolean(settings.video_made_with_ai),
              ...(settings.location?.id
                ? {
                    location_id: settings.location.id,
                    location_name: settings.location.name,
                  }
                : {}),
              // A API usa volume 0 (mudo) por padrao; o app usa 50, entao uma
              // faixa sem volume explicito segue o app em vez de sair muda.
              ...(settings.music?.id
                ? {
                    music_sound_info: {
                      music_sound_id: settings.music.id,
                      // null tambem cai no padrao (+null seria 0, mudo)
                      music_sound_volume:
                        settings.music.audio_volume != null
                          ? +settings.music.audio_volume
                          : 50,
                      video_original_sound_volume:
                        settings.music.video_volume != null
                          ? +settings.music.video_volume
                          : 50,
                    },
                  }
                : {}),
            }),
      },
    };
  }

  // autoAddMusic sorteia uma faixa da biblioteca comercial em vez do flag
  // auto_add_music do TikTok, para a musica ser escolhida aqui e nao em
  // silencio pelo TikTok. undefined quando a lista vem vazia/indisponivel: o
  // corpo da foto cai no auto_add_music. So erro de token sobe (ainda antes do
  // publish, entao renovar e repetir e seguro).
  private async pickRandomMusicId(
    accessToken: string,
    businessId: string
  ): Promise<string | undefined> {
    let tracks: Array<{ id: string }>;
    try {
      tracks = await this.musicSearch(accessToken, {}, businessId);
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }
      return undefined;
    }
    if (!tracks.length) {
      return undefined;
    }
    return tracks[Math.floor(Math.random() * tracks.length)].id;
  }

  private async buildPhotoBody(
    businessId: string,
    firstPost: PostDetails<TikTokBusinessDto>,
    accessToken: string
  ) {
    const isDraft = this.contentPostingMethod(firstPost) === 'UPLOAD';
    const settings = firstPost.settings || ({} as TikTokBusinessDto);

    // Musica aleatoria vence a faixa escolhida: o compositor esconde o seletor
    // enquanto "musica aleatoria" esta ligada, entao uma escolha antiga nao
    // pode passar por cima.
    const musicId =
      settings.autoAddMusic === 'yes'
        ? !isDraft
          ? await this.pickRandomMusicId(accessToken, businessId)
          : undefined
        : settings.music?.id;

    return {
      business_id: businessId,
      photo_images: firstPost.media?.map((p) => p.path),
      photo_cover_index: 0,
      post_info: {
        ...(settings.title
          ? { title: settings.title.slice(0, TIKTOK_PHOTO_TITLE_LIMIT) }
          : {}),
        ...(firstPost.message ? { caption: firstPost.message } : {}),
        is_brand_organic: this.assetBoolean(settings.brand_organic_toggle),
        is_branded_content: this.assetBoolean(settings.brand_content_toggle),
        ...(isDraft
          ? { is_draft: true }
          : {
              privacy_level: settings.privacy_level || 'PUBLIC_TO_EVERYONE',
              disable_comment: !this.assetBoolean(settings.comment),
              // o flag de musica recomendada do TikTok so entra quando nao deu
              // para sortear uma faixa da lista
              auto_add_music: !musicId && settings.autoAddMusic === 'yes',
              ...(settings.location?.id
                ? {
                    location_id: settings.location.id,
                    location_name: settings.location.name,
                  }
                : {}),
              // diferente do video, o music_sound_info de foto nao tem volume
              ...(musicId
                ? {
                    music_sound_info: {
                      music_sound_id: musicId,
                    },
                  }
                : {}),
            }),
      },
    };
  }

  // Dimensoes de uma imagem do post (URL pelo cliente SSRF-safe com prazo, ou
  // arquivo local confinado em UPLOAD_DIRECTORY via readOrFetch).
  protected async getImageDimensions(
    path: string,
    timeoutMs = IMAGE_CHECK_TIMEOUT_MS
  ): Promise<{ width: number; height: number }> {
    const buffer =
      path.indexOf('http') === 0
        ? Buffer.from(
            (
              await this.getSsrfSafeAxios()({
                url: path,
                method: 'GET',
                responseType: 'arraybuffer',
                maxContentLength: IMAGE_CHECK_MAX_BYTES,
                maxBodyLength: IMAGE_CHECK_MAX_BYTES,
                signal: AbortSignal.timeout(timeoutMs),
              })
            ).data
          )
        : await this.readOrFetch(path);
    const { width = 0, height = 0 } = await sharp(buffer).metadata();
    return { width, height };
  }

  // Pre-checagem do upstream #2240 (la no checkValidity do servidor, que o fork
  // nao tem; o compositor do fork faz a mesma conta no navegador). Aqui cobre
  // API publica, MCP e CLI antes do publish. Uma imagem por vez para nao segurar
  // ate 35 imagens na memoria do worker; imagem que nao da para medir passa, e
  // o que sobrar quando o orcamento de tempo acaba tambem (o TikTok decide).
  private async oversizedImageError(
    media: MediaContent[]
  ): Promise<string | undefined> {
    const deadline = Date.now() + IMAGE_CHECK_BUDGET_MS;
    for (const [index, item] of media.entries()) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        break;
      }
      if (!item?.path) {
        continue;
      }
      let dimensions: { width: number; height: number };
      try {
        dimensions = await this.getImageDimensions(
          item.path,
          Math.min(IMAGE_CHECK_TIMEOUT_MS, remaining)
        );
      } catch {
        continue;
      }
      if (
        Math.min(dimensions.width, dimensions.height) >
        TIKTOK_MAX_IMAGE_SHORT_SIDE
      ) {
        return `Image ${index + 1} is ${dimensions.width}x${
          dimensions.height
        }, TikTok allows a maximum of ${TIKTOK_MAX_IMAGE_SHORT_SIDE}px on the shorter side`;
      }
    }
    return undefined;
  }

  // Falhas que o TikTok devolveria so depois do publish (invalid_params,
  // picture_size_check_failed sem dizer qual imagem): barradas antes.
  private async assertPublishable(firstPost: PostDetails<TikTokBusinessDto>) {
    // mesmas regras de midia do checkValidity do upstream (no fork o
    // compositor checa no navegador; aqui cobre API publica, MCP e CLI)
    const media = firstPost?.media || [];
    const mediaError = !media.length
      ? 'No video / images selected'
      : media.length > 1 && media.some((m) => (m?.path || '').includes('mp4'))
      ? 'Only pictures are supported when selecting multiple items'
      : media.length > 35
      ? 'You can select up to 35 pictures'
      : undefined;
    if (mediaError) {
      throw new BadBody(
        this.identifier,
        JSON.stringify({ media: media.length }),
        Buffer.from('{}'),
        mediaError
      );
    }

    const isPhoto = isTikTokPhotoPost(firstPost?.media);
    const tooLong = tiktokCaptionTooLong(firstPost?.message || '', isPhoto);
    if (tooLong) {
      throw new BadBody(
        this.identifier,
        JSON.stringify({ length: (firstPost?.message || '').length }),
        Buffer.from('{}'),
        tooLong
      );
    }

    if (isPhoto) {
      const oversized = await this.oversizedImageError(firstPost?.media || []);
      if (oversized) {
        throw new BadBody(
          this.identifier,
          JSON.stringify({ reason: 'picture_size_precheck' }),
          Buffer.from('{}'),
          oversized
        );
      }
    }
  }

  async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails<TikTokBusinessDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const isPhoto = isTikTokPhotoPost(firstPost?.media);

    await this.assertPublishable(firstPost);

    const body = isPhoto
      ? await this.buildPhotoBody(id, firstPost, accessToken)
      : this.buildVideoBody(id, firstPost);

    const publish = await (
      await this.fetch(
        `${this.baseUrl}${
          isPhoto ? '/business/photo/publish/' : '/business/video/publish/'
        }`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': accessToken,
          },
          body: JSON.stringify(body),
        }
      )
    ).json();

    // A Business API devolve falha como HTTP 200 com code: o this.fetch nao
    // pega, entao o corpo e classificado aqui.
    if (publish?.code !== 0 || !publish?.data?.share_id) {
      const asString = JSON.stringify(publish);
      const handleError = this.handleErrors(asString);
      if (handleError?.type === 'refresh-token') {
        throw new RefreshToken(
          this.identifier,
          asString,
          JSON.stringify(body),
          handleError.value
        );
      }
      throw new BadBody(
        'tiktok-business-error-upload',
        asString,
        Buffer.from(JSON.stringify(body)),
        handleError?.value || publish?.message || 'TikTok refused the post'
      );
    }

    // O publish ja e irreversivel no TikTok: devolve `pending` para o workflow
    // consultar o checkPostStatus em vez de bloquear (e talvez estourar o
    // tempo e publicar de novo) dentro desta activity.
    return [
      {
        id: firstPost.id,
        releaseURL: '',
        postId: '',
        status: 'pending',
        pendingData: { publishId: publish.data.share_id },
      },
    ];
  }

  // Caminho bloqueante do workflow V102 (padrao do fork; o V112 usa
  // postPending + checkPostStatus): consulta dentro da activity, como antes.
  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<TikTokBusinessDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    // conta desde antes do postPending: a pre-checagem de imagem e o publish
    // entram no mesmo limite de 8 minutos
    const started = Date.now();
    const [response] = await this.postPending(
      id,
      accessToken,
      postDetails,
      integration
    );

    // Depois do publish, nada aqui pode virar erro retentavel: a activity
    // retentada (inclusive apos renovar o token) publicaria de novo. O TikTok ja
    // aceitou o post, entao o share_id e o link do perfil ficam salvos
    // (PublishedWithError) e o resolveReleaseId acha o post depois.
    const pendingData = response.pendingData as { publishId: string };
    const accepted = (message: string) =>
      new PublishedWithError(
        this.identifier,
        response.id,
        pendingData.publishId,
        this.profileUrl(integration),
        message
      );

    for (let attempt = 0; attempt < 27; attempt += 1) {
      // ~9 minutos a cada 20 s
      let check: PendingCheckResponse;
      try {
        check = await this.checkPostStatus(
          accessToken,
          pendingData,
          integration
        );
      } catch (err) {
        if (err instanceof RefreshToken) {
          throw accepted(
            'TikTok accepted the post, but its status could not be checked because the access token expired. Check the TikTok app before posting again'
          );
        }
        throw err;
      }

      if (check.status === 'completed') {
        return [
          {
            id: response.id,
            releaseURL: check.releaseURL,
            postId: String(check.postId),
            status: 'success',
          },
        ];
      }

      // Abaixo do timeout de 10 minutos da activity do V102: falhar aqui (nao
      // retentavel) e seguro; estourar o tempo nao e — a activity retentada
      // publicaria de novo.
      if (Date.now() - started > 8 * 60 * 1000) {
        break;
      }

      await timer(20000);
    }

    throw accepted(
      'TikTok did not confirm the publication in time. Check the TikTok app before posting again'
    );
  }

  // A lista de tendencias nao tem busca por texto (so genero/pais/periodo):
  // o compositor filtra a lista devolvida localmente.
  @Tool({
    description:
      'Load commercial music library tracks that can be attached to a post via the "music" setting',
    dataSchema: [
      {
        key: 'genre',
        type: 'string',
        description:
          'Genre to filter the tracks by (for example POP, ROCK, ELECTRONIC), leave empty for all genres',
      },
    ],
  })
  async musicSearch(
    accessToken: string,
    data: { genre?: string },
    id: string
  ) {
    const music = await (
      await this.fetch(
        `${this.baseUrl}/discovery/cml/trending_list/?business_id=${encodeURIComponent(
          id
        )}${data?.genre ? `&genre=${encodeURIComponent(data.genre)}` : ''}`,
        {
          method: 'GET',
          headers: {
            'Access-Token': accessToken,
          },
        }
      )
    ).json();

    // Erro de token vira RefreshToken para o endpoint de funcao renovar e
    // tentar de novo; qualquer outro erro so devolve lista vazia.
    if (music?.code !== 0) {
      this.throwIfTokenError(music);
      return [];
    }

    return (music?.data?.list || [])
      .map((track: any) => ({
        // music_sound_id so aceita song_clip_id: os endpoints de publish
        // recusam commercial_music_id com o 51065 generico. Faixa sem
        // full_duration_song_clip usa o clip de tendencia; sem nenhum dos dois
        // e descartada abaixo.
        id:
          track?.full_duration_song_clip?.song_clip_id ||
          track?.trending_song_clip?.song_clip_id,
        title: track?.commercial_music_name || '',
        artist: track?.artist || '',
        image: track?.thumbnail_url || '',
        duration:
          (track?.duration || track?.trending_song_clip?.duration || 0) * 1000,
        previewUrl:
          track?.preview_url || track?.trending_song_clip?.preview_url || '',
      }))
      .filter((track: { id?: string }) => track.id);
  }

  @Tool({
    description:
      'Search location tags that can be attached to a post via the "location" setting',
    dataSchema: [
      {
        key: 'q',
        type: 'string',
        description: 'Search query for the location',
      },
    ],
  })
  async locationSearch(accessToken: string, data: { q: string }, id: string) {
    if (!data?.q) {
      return [];
    }

    const locations = await (
      await this.fetch(
        `${this.baseUrl}/business/publish/location/?business_id=${encodeURIComponent(
          id
        )}&search_query=${encodeURIComponent(String(data.q).slice(0, 100))}`,
        {
          method: 'GET',
          headers: {
            'Access-Token': accessToken,
          },
        }
      )
    ).json();

    if (locations?.code !== 0) {
      this.throwIfTokenError(locations);
      return [];
    }

    return (locations?.data?.locations || []).map((location: any) => ({
      id: location?.location_id,
      name: location?.location_name || '',
      address: location?.location_address || '',
    }));
  }

  // Analytics le pelo analyticsFetch (sem retentativa de publicacao, pitfall
  // 13); a busca de conteudo para "conectar post" segue no this.fetch.
  private async loadVideoList(
    accessToken: string,
    businessId: string,
    fields: string[],
    reader: 'analytics' | 'publishing'
  ) {
    const url = `${this.baseUrl}/business/video/list/?business_id=${encodeURIComponent(
      businessId
    )}&fields=${encodeURIComponent(JSON.stringify(fields))}&max_count=20`;
    const options = {
      method: 'GET',
      headers: {
        'Access-Token': accessToken,
      },
    };
    const videoListData = await (
      reader === 'analytics'
        ? await this.analyticsFetch(url, options)
        : await this.fetch(url, options)
    ).json();

    // erro de token vira RefreshToken para quem chama renovar e repetir, em
    // vez de mostrar dados vazios ate o usuario reconectar
    this.throwIfTokenError(videoListData);

    return videoListData?.data?.videos;
  }

  // perfil do canal; sem handle conhecido, a home do TikTok (nunca /@ vazio)
  private profileUrl(integration: Integration) {
    return integration.profile
      ? `https://www.tiktok.com/@${encodeURIComponent(integration.profile)}`
      : 'https://www.tiktok.com/';
  }

  // post de foto (p_pub_... / p_inbox_...) fica em /photo/; o TikTok recusa
  // /video/ para ele. Handle codificado: a URL e persistida e reinjetada em
  // posts (updateTags).
  private postUrl(profile: string, publishId: string, postId: string) {
    return `https://www.tiktok.com/@${encodeURIComponent(profile)}/${
      publishId.indexOf('p_') === 0 ? 'photo' : 'video'
    }/${postId}`;
  }

  // post_ids traz int64 acima de Number.MAX_SAFE_INTEGER: o id sai do texto cru,
  // nao do JSON parseado
  private publicPostId(body: string) {
    return body.match(/"post_ids"\s*:\s*\[\s*"?(\d+)"?/)?.[1];
  }

  private throwIfTokenError(body: { code?: number }) {
    if (body?.code === 0) {
      return;
    }
    const asString = JSON.stringify(body);
    const handleError = this.handleErrors(asString);
    if (handleError?.type === 'refresh-token') {
      throw new RefreshToken(
        this.identifier,
        asString,
        '{}',
        handleError.value
      );
    }
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');

    try {
      // estatisticas da conta em tempo real (seguidores, seguindo, curtidas,
      // videos)
      const userStatsData = await (
        await this.analyticsFetch(
          `${this.baseUrl}/business/get/?business_id=${encodeURIComponent(
            id
          )}&fields=${encodeURIComponent(
            JSON.stringify([
              'followers_count',
              'following_count',
              'total_likes',
              'videos_count',
            ])
          )}`,
          {
            method: 'GET',
            headers: {
              'Access-Token': accessToken,
            },
          }
        )
      ).json();

      this.throwIfTokenError(userStatsData);

      const userStats = userStatsData?.data;

      const result: AnalyticsData[] = [];

      if (userStats) {
        if (userStats.followers_count !== undefined) {
          result.push({
            label: 'Followers',
            percentageChange: 0,
            data: [{ total: String(userStats.followers_count), date: today }],
          });
        }

        if (userStats.following_count !== undefined) {
          result.push({
            label: 'Following',
            percentageChange: 0,
            data: [{ total: String(userStats.following_count), date: today }],
          });
        }

        if (userStats.total_likes !== undefined) {
          result.push({
            label: 'Total Likes',
            percentageChange: 0,
            data: [{ total: String(userStats.total_likes), date: today }],
          });
        }

        if (userStats.videos_count !== undefined) {
          result.push({
            label: 'Videos',
            percentageChange: 0,
            data: [{ total: String(userStats.videos_count), date: today }],
          });
        }
      }

      // posts recentes com o engajamento acumulado, somados
      const videos = await this.loadVideoList(
        accessToken,
        id,
        ['item_id', 'likes', 'comments', 'shares', 'video_views'],
        'analytics'
      );

      if (videos && videos.length > 0) {
        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;
        let totalShares = 0;

        for (const video of videos) {
          totalViews += video.video_views || 0;
          totalLikes += video.likes || 0;
          totalComments += video.comments || 0;
          totalShares += video.shares || 0;
        }

        result.push({
          label: 'Views',
          percentageChange: 0,
          data: [{ total: String(totalViews), date: today }],
        });

        result.push({
          label: 'Recent Likes',
          percentageChange: 0,
          data: [{ total: String(totalLikes), date: today }],
        });

        result.push({
          label: 'Recent Comments',
          percentageChange: 0,
          data: [{ total: String(totalComments), date: today }],
        });

        result.push({
          label: 'Recent Shares',
          percentageChange: 0,
          data: [{ total: String(totalShares), date: today }],
        });
      }

      return result;
    } catch (err) {
      // quem chama renova o token e repete; engolir o RefreshToken deixaria o
      // painel vazio ate uma reconexao manual
      if (err instanceof RefreshToken) {
        throw err;
      }
      console.error(
        'Error fetching TikTok Business analytics:',
        summarizeError(err)
      );
      return [];
    }
  }

  async missing(
    id: string,
    accessToken: string
  ): Promise<{ id: string; url: string }[]> {
    try {
      const videos = await this.loadVideoList(
        accessToken,
        id,
        ['item_id', 'thumbnail_url'],
        'publishing'
      );

      if (!videos || videos.length === 0) {
        return [];
      }

      return videos.map((v: { item_id: string; thumbnail_url: string }) => ({
        id: String(v.item_id),
        url: v.thumbnail_url,
      }));
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }
      console.error(
        'Error fetching TikTok Business missing content:',
        summarizeError(err)
      );
      return [];
    }
  }

  // Posts salvos antes de post_ids existir guardam o share_id (v_pub_... /
  // p_pub_...) como releaseId: resolve para o id publico. Leitura de analytics,
  // por isso analyticsFetch (divergencia do upstream, igual ao nativo).
  async resolveReleaseId(
    accessToken: string,
    releaseId: string,
    integration: Integration,
    settings?: any,
    releaseURL?: string | null
  ): Promise<
    | { postId: string; releaseURL: string }
    | { pending: true }
    | { unavailable: true }
    | undefined
  > {
    // rascunho enviado para a caixa de entrada (UPLOAD) fica 'missing' com o
    // share id no fragmento da URL
    const draft = releaseId === 'missing';
    const publishId = draft ? releaseURL?.split('#')[1] || '' : releaseId;
    if (
      publishId.indexOf('_pub_') === -1 &&
      publishId.indexOf('_inbox_') === -1
    ) {
      return undefined;
    }

    // privacy_level so existe em post de foto aqui (e nao no rascunho: o
    // usuario escolhe no app), e o TikTok so da id a post publico
    if (
      !draft &&
      publishId.indexOf('p_pub_') === 0 &&
      ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS'].includes(settings?.privacy_level)
    ) {
      return { unavailable: true };
    }

    const body = await (
      await this.analyticsFetch(
        `${this.baseUrl}/business/publish/status/?business_id=${encodeURIComponent(
          integration.internalId
        )}&publish_id=${encodeURIComponent(publishId)}`,
        {
          method: 'GET',
          headers: {
            'Access-Token': accessToken,
          },
        }
      )
    ).text();

    // corpo que nao e JSON (HTML de erro) conta como "ainda sem id"
    let parsed: { code?: number } | undefined;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = undefined;
    }
    if (parsed) {
      this.throwIfTokenError(parsed);
    }

    const publicPostId = parsed?.code === 0 ? this.publicPostId(body) : undefined;
    // sem perfil (Integration.profile e opcional) a URL ficaria /@null/...
    // persistida para sempre: melhor nao resolver agora
    if (!publicPostId || !integration.profile) {
      // rascunho sem post publico (nao publicado, ou publicado como nao
      // publico) continua abrindo a caixa de entrada
      return draft ? undefined : { pending: true };
    }

    return {
      postId: publicPostId,
      releaseURL: this.postUrl(integration.profile, publishId, publicPostId),
    };
  }

  // Post conectado a mao: /video/<id> tambem abre post de foto (o TikTok
  // redireciona para /photo/<id>). O id vem do "Conectar post" (item_id da
  // lista de videos): so numero, e so com perfil conhecido.
  async releaseUrl(
    accessToken: string,
    releaseId: string,
    integration: Integration
  ) {
    if (!/^\d+$/.test(releaseId || '') || !integration?.profile) {
      return undefined;
    }
    return `https://www.tiktok.com/@${encodeURIComponent(
      integration.profile
    )}/video/${releaseId}`;
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    fromDate: number
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');

    // share_id ainda nao resolvido ou rascunho: nao ha video publico (o
    // PostsService.resolveRelease tenta resolver antes de chegar aqui)
    if (postId.indexOf('_pub_') > -1 || postId === 'missing') {
      return [];
    }

    try {
      const videoQueryData = await (
        await this.analyticsFetch(
          `${this.baseUrl}/business/video/list/?business_id=${encodeURIComponent(
            integrationId
          )}&fields=${encodeURIComponent(
            JSON.stringify([
              'item_id',
              'likes',
              'comments',
              'shares',
              'video_views',
            ])
          )}&filters=${encodeURIComponent(
            JSON.stringify({ video_ids: [postId] })
          )}`,
          {
            method: 'GET',
            headers: {
              'Access-Token': accessToken,
            },
          }
        )
      ).json();

      this.throwIfTokenError(videoQueryData);

      const video = videoQueryData?.data?.videos?.[0];

      if (!video) {
        return [];
      }

      const result: AnalyticsData[] = [];

      if (video.video_views !== undefined) {
        result.push({
          label: 'Views',
          percentageChange: 0,
          data: [{ total: String(video.video_views), date: today }],
        });
      }

      if (video.likes !== undefined) {
        result.push({
          label: 'Likes',
          percentageChange: 0,
          data: [{ total: String(video.likes), date: today }],
        });
      }

      if (video.comments !== undefined) {
        result.push({
          label: 'Comments',
          percentageChange: 0,
          data: [{ total: String(video.comments), date: today }],
        });
      }

      if (video.shares !== undefined) {
        result.push({
          label: 'Shares',
          percentageChange: 0,
          data: [{ total: String(video.shares), date: today }],
        });
      }

      return result;
    } catch (err) {
      if (err instanceof RefreshToken) {
        throw err;
      }
      console.error(
        'Error fetching TikTok Business post analytics:',
        summarizeError(err)
      );
      return [];
    }
  }
}
