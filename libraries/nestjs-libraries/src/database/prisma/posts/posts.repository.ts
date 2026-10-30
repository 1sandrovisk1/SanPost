import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Post as PostBody } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import {
  APPROVED_SUBMIT_FOR_ORDER,
  CommentKind,
  Post,
  State,
} from '@prisma/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import utc from 'dayjs/plugin/utc';
import { v4 as uuidv4 } from 'uuid';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';
import { curatedPostError } from './post.error.curation';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(isSameOrAfter);
dayjs.extend(utc);

@Injectable()
export class PostsRepository {
  private static readonly logger = new Logger(PostsRepository.name);
  constructor(
    private _post: PrismaRepository<'post'>,
    private _popularPosts: PrismaRepository<'popularPosts'>,
    private _comments: PrismaRepository<'comments'>,
    private _tags: PrismaRepository<'tags'>,
    private _tagsPosts: PrismaRepository<'tagsPosts'>,
    private _errors: PrismaRepository<'errors'>,
    @Optional() private readonly transaction?: PrismaTransaction
  ) {}

  searchForMissingThreeHoursPosts() {
    return this._post.model.post.findMany({
      where: {
        integration: {
          refreshNeeded: false,
          inBetweenSteps: false,
          disabled: false,
        },
        publishDate: {
          gte: dayjs.utc().subtract(2, 'hour').toDate(),
          lt: dayjs.utc().add(2, 'hour').toDate(),
        },
        state: 'QUEUE',
        deletedAt: null,
        parentPostId: null,
        OR: [{ profileId: null }, { profile: { deletedAt: null } }],
      },
      select: {
        id: true,
        organizationId: true,
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
          },
        },
        publishDate: true,
      },
    });
  }

  /**
   * Posts que falharam ao publicar (state=ERROR) nos ultimos 30 dias, para a
   * tela de Status. Escopado por org; `profileId` opcional (drill-down futuro).
   * Traz canal + perfil de origem embutidos. Limite defensivo: um unico canal
   * caido gera muitos erros, entao capamos e ordenamos pelos mais recentes.
   */
  getErrorPosts(orgId: string, profileId?: string, limit = 50) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        parentPostId: null,
        state: 'ERROR',
        OR: [{ profileId: null }, { profile: { deletedAt: null } }],
        updatedAt: { gte: dayjs.utc().subtract(30, 'day').toDate() },
        ...(profileId ? { profileId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        // NAO selecionar `error`: Post.error e uma serializacao completa da
        // excecao e pode conter refresh_token/client_secret (details[].body de
        // RefreshToken/BadBody). A tela de Status so precisa da contagem por canal.
        id: true,
        updatedAt: true,
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
            internalId: true,
            name: true,
            picture: true,
          },
        },
        profile: {
          select: { id: true, name: true },
        },
      },
    });
  }

  getOldPosts(orgId: string, date: string, profileId?: string | null) {
    return this._post.model.post.findMany({
      where: {
        integration: {
          refreshNeeded: false,
          inBetweenSteps: false,
          disabled: false,
        },
        organizationId: orgId,
        // membro USER: so posts do proprio perfil (undefined = admin)
        ...(profileId !== undefined ? { profileId } : {}),
        publishDate: {
          lte: dayjs(date).toDate(),
        },
        deletedAt: null,
        parentPostId: null,
      },
      orderBy: {
        publishDate: 'desc',
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }

  updateImages(id: string, images: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        image: images,
      },
    });
  }

  getPostUrls(orgId: string, ids: string[]) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        id: {
          in: ids,
        },
      },
      select: {
        id: true,
        releaseURL: true,
      },
    });
  }

  async getPosts(orgId: string, query: GetPostsDto, profileId?: string) {
    // Use the provided start and end dates directly
    const startDate = dayjs.utc(query.startDate).toDate();
    const endDate = dayjs.utc(query.endDate).toDate();

    const list = await this._post.model.post.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                organizationId: orgId,
              },
            ],
          },
          ...(profileId ? [{ profileId }] : []),
          {
            OR: [
              {
                publishDate: {
                  gte: startDate,
                  lte: endDate,
                },
              },
              {
                intervalInDays: {
                  not: null,
                },
              },
            ],
          },
        ],
        integration: {
          deletedAt: null,
        },
        deletedAt: null,
        parentPostId: null,
        ...(query.customer
          ? {
              integration: {
                customerId: query.customer,
              },
            }
          : {}),
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        releaseId: true,
        state: true,
        // so a mensagem curada sai daqui (curatedPostError, upstream #2119)
        error: true,
        intervalInDays: true,
        group: true,
        tags: {
          // tag apagada (soft delete) nao aparece mais no post (upstream #1827)
          where: { tag: { deletedAt: null } },
          select: {
            tag: true,
          },
        },
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
            name: true,
            picture: true,
          },
        },
        // Ultima acao de revisao do cliente (aprovar/pedir alteracao) — para o
        // selo de status no calendario. Leve: so o registro mais recente.
        comments: {
          where: {
            kind: { in: ['APPROVAL', 'CHANGE_REQUEST'] },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { kind: true, createdAt: true },
        },
      },
    });

    return list
      .map((post) => ({ ...post, error: curatedPostError(post.error) }))
      .reduce((all, post) => {
        if (!post.intervalInDays) {
          return [...all, post];
        }

        const addMorePosts = [];
        let startingDate = dayjs.utc(post.publishDate);
        while (dayjs.utc(endDate).isSameOrAfter(startingDate)) {
          if (dayjs(startingDate).isSameOrAfter(dayjs.utc(post.publishDate))) {
            addMorePosts.push({
              ...post,
              publishDate: startingDate.toDate(),
              actualDate: post.publishDate,
            });
          }

          startingDate = startingDate.add(post.intervalInDays, 'days');
        }

        return [...all, ...addMorePosts];
      }, [] as any[]);
  }

  async getPostsList(
    orgId: string,
    query: GetPostsListDto,
    profileId?: string
  ) {
    const page = query.page || 0;
    const limit = query.limit || 20;
    const skip = page * limit;

    const where = {
      AND: [
        {
          OR: [
            {
              organizationId: orgId,
            },
          ],
        },
        ...(profileId ? [{ profileId }] : []),
        {
          publishDate: {
            gte: dayjs.utc().toDate(),
          },
        },
      ],
      deletedAt: null as Date | null,
      parentPostId: null as string | null,
      intervalInDays: null as number | null,
      ...(query.customer || query.integrations?.length
        ? {
            integration: {
              ...(query.customer ? { customerId: query.customer } : {}),
              ...(query.integrations?.length
                ? { id: { in: query.integrations } }
                : {}),
            },
          }
        : {}),
    };

    const [posts, total] = await Promise.all([
      this._post.model.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          publishDate: 'asc',
        },
        select: {
          id: true,
          content: true,
          publishDate: true,
          releaseURL: true,
          releaseId: true,
          state: true,
          group: true,
          tags: {
            // tag apagada (soft delete) nao aparece mais no post (upstream #1827)
            where: { tag: { deletedAt: null } },
            select: {
              tag: true,
            },
          },
          integration: {
            select: {
              id: true,
              providerIdentifier: true,
              name: true,
              picture: true,
            },
          },
        },
      }),
      this._post.model.post.count({ where }),
    ]);

    return {
      posts,
      total,
      page,
      limit,
      hasMore: skip + posts.length < total,
    };
  }

  async deletePost(orgId: string, group: string, profileId?: string) {
    await this._post.model.post.updateMany({
      where: {
        organizationId: orgId,
        group,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // mesmo escopo do soft delete: o id devolvido (e usado para encerrar o
    // workflow do post) nunca e de um grupo de outro perfil
    return this._post.model.post.findFirst({
      where: {
        organizationId: orgId,
        group,
        parentPostId: null,
        ...(profileId ? { profileId } : {}),
      },
      select: {
        id: true,
      },
    });
  }

  // Os outros canais do lote, sem o grupo aberto (upstream a194e3f4). Raizes
  // pelo batchId no perfil do post aberto (canal vivo e do mesmo perfil);
  // cadeias inteiras pelo grupo + canal da raiz, porque comentarios criados
  // depois (post-management) podem nao ter batchId.
  async getPostsByBatch(
    orgId: string,
    batchId: string,
    exceptGroup: string,
    profileId: string | null
  ) {
    const roots = await this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        batchId,
        parentPostId: null,
        deletedAt: null,
        group: { not: exceptGroup },
        profileId,
        integration: { deletedAt: null, disabled: false, profileId },
      },
      select: { group: true, integrationId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!roots.length) {
      return [];
    }

    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: roots.map((root) => ({
          group: root.group,
          integrationId: root.integrationId,
        })),
      },
      include: {
        integration: true,
        tags: {
          where: { tag: { deletedAt: null } },
          select: { tag: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  getPostsByGroup(orgId: string, group: string) {
    return this._post.model.post.findMany({
      where: {
        group,
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
      },
      include: {
        integration: true,
        tags: {
          // tag apagada (soft delete) nao aparece mais no post (upstream #1827)
          where: { tag: { deletedAt: null } },
          select: {
            tag: true,
          },
        },
      },
    });
  }

  getPost(
    id: string,
    includeIntegration = false,
    orgId?: string,
    isFirst?: boolean
  ) {
    return this._post.model.post.findUnique({
      where: {
        id,
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
        organization: { deletedAt: null },
        ...(isFirst
          ? { OR: [{ profileId: null }, { profile: { deletedAt: null } }] }
          : {}),
      },
      include: {
        ...(includeIntegration
          ? {
              integration: true,
              tags: {
                // tag apagada (soft delete) nao aparece mais no post (upstream #1827)
                where: { tag: { deletedAt: null } },
                select: {
                  tag: true,
                },
              },
            }
          : {}),
        childrenPost: true,
      },
    });
  }

  updatePost(id: string, postId: string, releaseURL: string) {
    if (this.transaction)
      return this.transaction.model.$transaction(async (tx) => {
        const post = await tx.post.update({
          where: { id },
          data: {
            state: 'PUBLISHED',
            releaseURL,
            releaseId: postId,
            error: null,
          },
        });
        if (postId && postId !== 'missing')
          await tx.scheduledAutomationTarget.updateMany({
            where: {
              postId: id,
              integrationId: post.integrationId,
              publishedReleaseId: null,
              flow: {
                organizationId: post.organizationId,
                profileId: post.profileId,
              },
            },
            data: { publishedReleaseId: postId },
          });
        return post;
      });
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        state: 'PUBLISHED',
        releaseURL,
        releaseId: postId,
        error: null,
      },
    });
  }

  // post que entrou no ar mas falhou num passo seguinte (PublishedWithError):
  // grava id/URL na plataforma sem mexer no estado (o workflow marca ERROR)
  updatePublishedRelease(
    id: string,
    orgId: string,
    releaseId: string,
    releaseURL: string
  ) {
    return this._post.model.post.update({
      where: { id, organizationId: orgId },
      data: { releaseId, releaseURL },
      select: { id: true },
    });
  }

  // Troca o publish id guardado pelo id publico definitivo (e a URL) quando a
  // plataforma o expoe depois da publicacao (ver PostsService.resolveRelease).
  // `previousReleaseId` no where: uma resolucao antiga nao sobrescreve uma
  // republicacao concorrente (que troca o releaseId); sem match, o Prisma
  // lanca P2025 e o chamador descarta a resolucao.
  updateResolvedRelease(
    id: string,
    orgId: string,
    previousReleaseId: string,
    releaseId: string,
    releaseURL: string
  ) {
    return this._post.model.post.update({
      where: {
        id,
        organizationId: orgId,
        releaseId: previousReleaseId,
      },
      data: {
        releaseId,
        releaseURL,
      },
    });
  }

  updateReleaseId(
    id: string,
    orgId: string,
    releaseId: string,
    releaseURL?: string
  ) {
    // a URL vem do provider quando o post e conectado a mao (upstream #2212)
    const data = {
      releaseId: String(releaseId),
      ...(releaseURL ? { releaseURL } : {}),
    };
    if (this.transaction)
      return this.transaction.model.$transaction(async (tx) => {
        const post = await tx.post.update({
          where: { id, organizationId: orgId, releaseId: 'missing' },
          data,
        });
        if (releaseId && releaseId !== 'missing')
          await tx.scheduledAutomationTarget.updateMany({
            where: {
              postId: id,
              integrationId: post.integrationId,
              publishedReleaseId: null,
              flow: {
                organizationId: post.organizationId,
                profileId: post.profileId,
              },
            },
            data: { publishedReleaseId: String(releaseId) },
          });
        return { id: post.id };
      });
    return this._post.model.post.update({
      where: {
        id,
        organizationId: orgId,
        releaseId: 'missing',
      },
      data,
      // a resposta vai para a API publica/dashboard: nunca a linha inteira
      select: { id: true },
    });
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    const update = await this._post.model.post.update({
      where: {
        id,
      },
      data: {
        state,
        ...(err
          ? { error: typeof err === 'string' ? err : JSON.stringify(err) }
          : {}),
      },
      include: {
        integration: {
          select: {
            providerIdentifier: true,
            // name/picture alimentam o snapshot do StatusEvent (POST_FAILED) —
            // emitido pelo PostsService a partir deste retorno, sem query extra.
            name: true,
            picture: true,
          },
        },
      },
    });

    if (state === 'ERROR' && err && body) {
      try {
        await this._errors.model.errors.create({
          data: {
            message: typeof err === 'string' ? err : JSON.stringify(err),
            organizationId: update.organizationId,
            platform: update.integration.providerIdentifier,
            postId: update.id,
            body: typeof body === 'string' ? body : JSON.stringify(body),
          },
        });
      } catch (err) {}
    }

    return update;
  }

  getErrorsByPostIds(postIds: string[]) {
    return this._errors.model.errors.findMany({
      where: {
        postId: { in: postIds },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async changeDate(
    orgId: string,
    id: string,
    date: string,
    isDraft: boolean,
    action: 'schedule' | 'update' = 'schedule'
  ) {
    return this._post.model.post.update({
      where: {
        organizationId: orgId,
        id,
      },
      data: {
        publishDate: dayjs(date).toDate(),
        // schedule: set state to QUEUE (or DRAFT if it was a draft)
        // update: don't change the state
        ...(action === 'schedule'
          ? {
              state: isDraft ? 'DRAFT' : 'QUEUE',
              releaseId: null,
              releaseURL: null,
              error: null,
            }
          : {}),
      },
      // a resposta vai ao dashboard: nunca a linha inteira (error cru do
      // provider, batchId)
      select: { id: true, publishDate: true, state: true },
    });
  }

  countPostsFromDay(orgId: string, date: Date) {
    return this._post.model.post.count({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: date,
        },
        OR: [
          {
            deletedAt: null,
            state: {
              in: ['QUEUE'],
            },
          },
          {
            state: 'PUBLISHED',
          },
        ],
      },
    });
  }

  // O painel manda { value: nome, label: nome }; API/MCP mandam
  // { value: id, label: nome }. Casa pelo id quando ele existe no escopo e cai
  // para o nome (label antes de value); sempre na org e no perfil (sem tag
  // homonima de outro cliente). Canal sem perfil: escopo da org, como o
  // getTags. Nomes comparados exatamente como foram gravados.
  private async resolvePostTags(
    orgId: string,
    profileId: string | undefined,
    tags: { value: string; label: string }[]
  ) {
    const text = (v: unknown) =>
      typeof v === 'string' && v.trim() ? v : undefined;
    const ids = tags.map((t) => text(t?.value)).filter(Boolean) as string[];
    const names = tags
      .flatMap((t) => [text(t?.label), text(t?.value)])
      .filter(Boolean) as string[];
    if (!names.length) {
      return [];
    }

    const found = await this._tags.model.tags.findMany({
      where: {
        orgId,
        ...(profileId ? { profileId } : {}),
        deletedAt: null,
        OR: [{ id: { in: ids } }, { name: { in: names } }],
      },
      // homonimas no mesmo escopo: sempre a mais antiga
      orderBy: { createdAt: 'asc' },
    });

    const chosen = new Map<string, (typeof found)[number]>();
    let missing = 0;
    for (const tag of tags) {
      const hit =
        found.find((f) => f.id === text(tag?.value)) ||
        found.find((f) => f.name === text(tag?.label)) ||
        found.find((f) => f.name === text(tag?.value));
      if (hit) {
        chosen.set(hit.id, hit);
      } else {
        missing++;
      }
    }
    if (missing) {
      PostsRepository.logger.warn(
        `tags sem correspondencia no escopo: ${missing} de ${tags.length}`
      );
    }
    return [...chosen.values()];
  }

  async createOrUpdatePost(
    state: 'draft' | 'schedule' | 'now' | 'update',
    orgId: string,
    date: string,
    body: PostBody,
    tags: { value: string; label: string }[],
    inter?: number,
    profileId?: string,
    // posts salvos juntos para varios canais (upstream a194e3f4): abrir um no
    // editor traz os outros
    batchId?: string
  ) {
    const posts: Post[] = [];
    const uuid = uuidv4();

    // um post editado fica no lote em que nasceu, mesmo salvo sozinho; achado
    // pelo grupo enviado (o editor gera ids novos para os valores) antes do
    // loop, que move as linhas para o grupo novo
    const existingBatchId = body.group
      ? (
          await this._post.model.post.findFirst({
            where: {
              group: body.group,
              organizationId: orgId,
              deletedAt: null,
              batchId: { not: null },
              // sem perfil: so lote de posts sem perfil, nunca o de outro
              profileId: profileId ?? null,
            },
            select: { batchId: true },
          })
        )?.batchId
      : undefined;
    const resolvedBatchId = existingBatchId || batchId;

    for (const value of body.value) {
      const updateData = (type: 'create' | 'update') => ({
        publishDate: dayjs(date).toDate(),
        integration: {
          connect: {
            id: body.integration.id,
            organizationId: orgId,
          },
        },
        ...(posts?.[posts.length - 1]?.id
          ? {
              parentPost: {
                connect: {
                  id: posts[posts.length - 1]?.id,
                },
              },
            }
          : type === 'update'
          ? {
              parentPost: {
                disconnect: true,
              },
            }
          : {}),
        content: value.content,
        delay: value.delay || 0,
        group: uuid,
        ...(resolvedBatchId ? { batchId: resolvedBatchId } : {}),
        intervalInDays: inter ? +inter : null,
        approvedSubmitForOrder: APPROVED_SUBMIT_FOR_ORDER.NO,
        ...(state === 'update'
          ? {}
          : {
              state:
                state === 'draft' ? ('DRAFT' as const) : ('QUEUE' as const),
            }),
        image: JSON.stringify(value.image),
        settings: JSON.stringify(body.settings),
        organization: {
          connect: {
            id: orgId,
          },
        },
        ...(profileId ? { profile: { connect: { id: profileId } } } : {}),
      });

      posts.push(
        await this._post.model.post.upsert({
          where: {
            id: value.id || uuidv4(),
          },
          create: { ...updateData('create') },
          update: {
            ...updateData('update'),
            lastMessage: {
              disconnect: true,
            },
            submittedForOrder: {
              disconnect: true,
            },
          },
        })
      );

      if (posts.length === 1) {
        await this._tagsPosts.model.tagsPosts.deleteMany({
          where: {
            post: {
              id: posts[0].id,
            },
          },
        });

        if (tags.length) {
          const tagsList = await this.resolvePostTags(orgId, profileId, tags);

          if (tagsList.length) {
            await this._post.model.post.update({
              where: {
                id: posts[posts.length - 1].id,
              },
              data: {
                tags: {
                  createMany: {
                    data: tagsList.map((tag) => ({
                      tagId: tag.id,
                    })),
                  },
                },
              },
            });
          }
        }
      }
    }

    // group vem do cliente: sem organizationId (e perfil) aqui, quem soubesse o
    // id do grupo apagava o grupo alheio. Post legado sem perfil continua
    // substituivel por qualquer perfil, como ja e legivel por todos.
    const groupScope = {
      group: body.group,
      organizationId: orgId,
      deletedAt: null as Date | null,
      ...(profileId
        ? { OR: [{ profileId }, { profileId: null as string | null }] }
        : {}),
    };
    const previousPost = body.group
      ? (
          await this._post.model.post.findFirst({
            where: {
              ...groupScope,
              parentPostId: null,
            },
            select: {
              id: true,
            },
          })
        )?.id!
      : undefined;

    if (body.group) {
      await this._post.model.post.updateMany({
        where: groupScope,
        data: {
          parentPostId: null,
          deletedAt: new Date(),
        },
      });
    }

    return { previousPost, posts };
  }

  async submit(id: string, order: string, buyerOrganizationId: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        submittedForOrderId: order,
        approvedSubmitForOrder: 'WAITING_CONFIRMATION',
        submittedForOrganizationId: buyerOrganizationId,
      },
      select: {
        id: true,
        description: true,
        submittedForOrder: {
          select: {
            messageGroupId: true,
          },
        },
      },
    });
  }

  updateMessage(id: string, messageId: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        lastMessageId: messageId,
      },
    });
  }

  getPostById(id: string, org?: string) {
    return this._post.model.post.findUnique({
      where: {
        id,
        ...(org ? { organizationId: org } : {}),
      },
      include: {
        integration: true,
        submittedForOrder: {
          include: {
            posts: {
              where: {
                state: 'PUBLISHED',
              },
            },
            ordersItems: true,
            seller: {
              select: {
                id: true,
                account: true,
              },
            },
          },
        },
      },
    });
  }

  findAllExistingCategories() {
    return this._popularPosts.model.popularPosts.findMany({
      select: {
        category: true,
      },
      distinct: ['category'],
    });
  }

  findAllExistingTopicsOfCategory(category: string) {
    return this._popularPosts.model.popularPosts.findMany({
      where: {
        category,
      },
      select: {
        topic: true,
      },
      distinct: ['topic'],
    });
  }

  findPopularPosts(category: string, topic?: string) {
    return this._popularPosts.model.popularPosts.findMany({
      where: {
        category,
        ...(topic ? { topic } : {}),
      },
      select: {
        content: true,
        hook: true,
      },
    });
  }

  createPopularPosts(post: {
    category: string;
    topic: string;
    content: string;
    hook: string;
  }) {
    return this._popularPosts.model.popularPosts.create({
      data: {
        category: 'category',
        topic: 'topic',
        content: 'content',
        hook: 'hook',
      },
    });
  }

  async getPostsCountsByDates(
    orgId: string,
    times: number[],
    date: dayjs.Dayjs,
    profileId?: string
  ) {
    const dates = await this._post.model.post.findMany({
      where: {
        deletedAt: null,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        publishDate: {
          in: times.map((time) => {
            return date.clone().add(time, 'minutes').toDate();
          }),
        },
      },
    });

    return times.filter(
      (time) =>
        date.clone().add(time, 'minutes').isAfter(dayjs.utc()) &&
        !dates.find((dateFind) => {
          return (
            dayjs
              .utc(dateFind.publishDate)
              .diff(date.clone().startOf('day'), 'minutes') == time
          );
        })
    );
  }

  // Comentarios de todos os itens da thread do preview (upstream #2079).
  async getComments(postIds: string[], orgId?: string) {
    return this._comments.model.comments.findMany({
      where: {
        postId: { in: postIds },
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        postId: true,
        parentId: true,
        kind: true,
        content: true,
        anchorStart: true,
        anchorEnd: true,
        anchorQuote: true,
        resolvedAt: true,
        createdAt: true,
        userId: true,
        reviewLinkId: true,
        guestName: true,
        // Identidade do autor só no caminho autenticado (orgId presente). O
        // endpoint publico/guest (sem orgId) NAO expoe e-mail/nome da equipe.
        ...(orgId ? { user: { select: { email: true, name: true } } } : {}),
      },
    });
  }

  // Comentario pai de uma resposta (a thread do preview e conferida no service).
  getCommentForReply(id: string) {
    return this._comments.model.comments.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        postId: true,
        parentId: true,
        resolvedAt: true,
        kind: true,
      },
    });
  }

  // Comentario da org com o perfil do post, para resolver/excluir.
  getCommentScope(id: string, orgId: string) {
    return this._comments.model.comments.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        postId: true,
        parentId: true,
        kind: true,
        post: { select: { profileId: true, deletedAt: true } },
      },
    });
  }

  setCommentResolved(id: string, orgId: string, resolvedAt: Date | null) {
    return this._comments.model.comments.updateMany({
      where: { id, organizationId: orgId, parentId: null, deletedAt: null },
      data: { resolvedAt },
    });
  }

  // Exclusao logica do comentario e das respostas dele.
  softDeleteComment(id: string, orgId: string) {
    return this._comments.model.comments.updateMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [{ id }, { parentId: id }],
      },
      data: { deletedAt: new Date() },
    });
  }

  getAnchoredComments(postIds: string[]) {
    return this._comments.model.comments.findMany({
      where: {
        postId: { in: postIds },
        deletedAt: null,
        anchorStart: { not: null },
      },
      select: {
        id: true,
        postId: true,
        anchorStart: true,
        anchorEnd: true,
        anchorQuote: true,
      },
    });
  }

  detachAnchors(ids: string[]) {
    return this._comments.model.comments.updateMany({
      where: { id: { in: ids } },
      data: { anchorStart: null, anchorEnd: null },
    });
  }

  // profileId do post — usado para escopar acoes de revisao ao perfil do
  // membro (um VIEWER de Dell so revisa posts do Dell).
  async getPostProfileScope(orgId: string, postId: string) {
    return this._post.model.post.findFirst({
      where: { id: postId, organizationId: orgId, deletedAt: null },
      select: { id: true, profileId: true },
    });
  }

  async getTags(orgId: string, profileId?: string) {
    return this._tags.model.tags.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(profileId ? { profileId } : {}),
      },
    });
  }

  createTag(orgId: string, body: CreateTagDto, profileId?: string) {
    return this._tags.model.tags.create({
      data: {
        orgId,
        name: body.name,
        color: body.color,
        ...(profileId ? { profileId } : {}),
      },
    });
  }

  editTag(id: string, orgId: string, body: CreateTagDto, profileId?: string) {
    return this._tags.model.tags.update({
      where: {
        id,
        orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        name: body.name,
        color: body.color,
      },
    });
  }

  async deleteTag(id: string, orgId: string, profileId?: string) {
    const tag = await this._tags.model.tags.update({
      where: {
        id,
        orgId,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // vinculos de uma tag apagada nao servem mais (upstream #1827)
    await this._tagsPosts.model.tagsPosts.deleteMany({
      where: {
        tagId: tag.id,
      },
    });

    return tag;
  }

  // `userId` nulo = visitante anonimo do preview (nome em `guestName`).
  createComment(
    orgId: string,
    userId: string | null,
    postId: string,
    content: string,
    kind: CommentKind = 'COMMENT',
    extra: {
      parentId?: string;
      anchorStart?: number;
      anchorEnd?: number;
      anchorQuote?: string;
      guestName?: string;
      guestIp?: string | null;
      guestUserAgent?: string | null;
    } = {}
  ) {
    return this._comments.model.comments.create({
      data: {
        organizationId: orgId,
        userId,
        postId,
        content,
        kind,
        parentId: extra.parentId ?? null,
        anchorStart: extra.anchorStart ?? null,
        anchorEnd: extra.anchorEnd ?? null,
        anchorQuote: extra.anchorQuote ?? null,
        guestName: extra.guestName ?? null,
        guestIp: extra.guestIp ?? null,
        guestUserAgent: extra.guestUserAgent ?? null,
      },
      select: { id: true, kind: true, createdAt: true },
    });
  }

  async getPostByForWebhookId(postId: string, integrationId: string) {
    const select = {
      id: true,
      content: true,
      publishDate: true,
      releaseURL: true,
      state: true,
      integration: {
        select: {
          id: true,
          name: true,
          providerIdentifier: true,
          picture: true,
          type: true,
        },
      },
    };

    const posts = await this._post.model.post.findMany({
      where: {
        id: postId,
        integrationId,
        deletedAt: null,
        parentPostId: null,
      },
      select,
    });

    if (posts.length) {
      return posts;
    }

    // Os workflows de post (V101/V102/V112) passam o id do post NA PLATAFORMA,
    // que o updatePost ja gravou como releaseId antes do webhook: sem este
    // fallback o payload do webhook saia sempre vazio (upstream #2087).
    return this._post.model.post.findMany({
      where: {
        releaseId: postId,
        integrationId,
        deletedAt: null,
        parentPostId: null,
      },
      orderBy: {
        updatedAt: 'desc' as const,
      },
      take: 1,
      select,
    });
  }

  async getPostsSince(orgId: string, since: string) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: new Date(since),
        },
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }
}
