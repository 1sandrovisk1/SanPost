import { createPrismaRepositoryMock } from '../../../test';
import { PostsRepository } from './posts.repository';
describe('resultado de publicacao e alvo agendado', () => {
 const post=createPrismaRepositoryMock('post');
 const tx={post:post.model.post,scheduledAutomationTarget:{updateMany:jest.fn()}};
 const transaction={model:{$transaction:jest.fn(async callback=>callback(tx))}};
 const repo=new PostsRepository(post as any,{} as any,{} as any,{} as any,{} as any,{} as any,transaction as any);
 beforeEach(()=>{jest.clearAllMocks();tx.post.update.mockResolvedValue({id:'local',organizationId:'o',profileId:'p',integrationId:'i'});});
 it('criacao de tags usa ids e perfil para nao associar etiquetas homonimas de outro cliente', async () => {
  const tag=createPrismaRepositoryMock('tags');const link=createPrismaRepositoryMock('tagsPosts');
  const local=new PostsRepository(post as any,{} as any,{} as any,tag as any,link as any,{} as any);
  post.model.post.upsert.mockResolvedValue({id:'post'});tag.model.tags.findMany.mockResolvedValue([{id:'tag'}]);
  await local.createOrUpdatePost('schedule','o','2026-11-01T15:00:00Z',{integration:{id:'i'},value:[{id:'post',content:'Texto',image:[]}],settings:{__type:'facebook'}} as any,[{value:'tag',label:'Campanha'}],undefined,'p');
  expect(tag.model.tags.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({orgId:'o',profileId:'p',id:{in:['tag']},deletedAt:null})}));
 });
 it('salva resultado e congela apenas alvos ainda sem primeira publicacao na mesma transacao',async()=>{
  await repo.updatePost('local','123_456','https://example.com');
  expect(transaction.model.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.post.update).toHaveBeenCalledWith({where:{id:'local'},data:{state:'PUBLISHED',releaseURL:'https://example.com',releaseId:'123_456',error:null}});
  expect(tx.scheduledAutomationTarget.updateMany).toHaveBeenCalledWith({where:{postId:'local',integrationId:'i',publishedReleaseId:null,flow:{organizationId:'o',profileId:'p'}},data:{publishedReleaseId:'123_456'}});
 });
 it('nao congela missing e inclui a correcao posterior na transacao',async()=>{
  await repo.updatePost('local','missing','https://example.com');expect(tx.scheduledAutomationTarget.updateMany).not.toHaveBeenCalled();
  expect(await repo.updateReleaseId('local','o','123_789')).toEqual({id:'local'});
  expect(tx.post.update).toHaveBeenLastCalledWith({where:{id:'local',organizationId:'o',releaseId:'missing'},data:{releaseId:'123_789'}});
  expect(tx.scheduledAutomationTarget.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:{publishedReleaseId:'123_789'}}));
 });
});

// Porte do upstream #2186: persiste o id publico resolvido depois da publicacao.
describe('PostsRepository.updateResolvedRelease', () => {
  it('persiste id publico e URL definitiva do post, restrito a org e ao releaseId anterior', async () => {
    const prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).update = jest.fn().mockResolvedValue({} as any);
    const repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await repo.updateResolvedRelease(
      'post-1',
      'org-1',
      'v_pub_url~abc',
      '7345678901234567891',
      'https://www.tiktok.com/@p/video/7345678901234567891'
    );

    expect(prismaMock.model.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1', organizationId: 'org-1', releaseId: 'v_pub_url~abc' },
      data: {
        releaseId: '7345678901234567891',
        releaseURL: 'https://www.tiktok.com/@p/video/7345678901234567891',
      },
    });
  });
});

describe('PostsRepository.updateReleaseId', () => {
  it('so grava quando o releaseId ainda e missing e devolve apenas o id', async () => {
    const prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).update = jest.fn().mockResolvedValue({ id: 'post-1' } as any);
    const repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await repo.updateReleaseId('post-1', 'org-1', '123');

    expect(prismaMock.model.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1', organizationId: 'org-1', releaseId: 'missing' },
      data: { releaseId: '123' },
      select: { id: true },
    });
  });
});

// group e controlado pelo cliente: a troca de grupo (soft delete do grupo
// anterior) precisa ficar restrita a org, senao um grupo alheio e apagado.
describe('PostsRepository.createOrUpdatePost (troca de grupo restrita a org)', () => {
  it('busca e apaga o grupo anterior so dentro da org', async () => {
    const prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).upsert = jest.fn().mockResolvedValue({ id: 'p1' } as any);
    (prismaMock.model.post as any).findFirst = jest.fn().mockResolvedValue(null as any);
    (prismaMock.model.post as any).updateMany = jest.fn().mockResolvedValue({ count: 0 } as any);
    const tagsPostsMock = createPrismaRepositoryMock('tagsPosts');
    (tagsPostsMock.model.tagsPosts as any).deleteMany = jest.fn().mockResolvedValue({ count: 0 } as any);
    const repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      tagsPostsMock as any,
      {} as any
    );

    await repo.createOrUpdatePost(
      'draft',
      'org-1',
      '2026-10-26T10:00:00',
      {
        group: 'g-alheio',
        integration: { id: 'int-1' },
        settings: {},
        value: [{ id: 'p1', content: 'x', image: [] }],
      } as any,
      []
    );

    expect(prismaMock.model.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ group: 'g-alheio', organizationId: 'org-1' }),
      })
    );
    expect(prismaMock.model.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ group: 'g-alheio', organizationId: 'org-1' }),
      })
    );
  });
});

// GET /posts/old (seletor de post para URL) listava posts de todos os perfis
// para um membro restrito.
describe('PostsRepository.getOldPosts', () => {
  const build = () => {
    const prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).findMany = jest.fn().mockResolvedValue([]);
    const repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    return { repo, findMany: prismaMock.model.post.findMany as jest.Mock };
  };

  it('filtra pelo perfil quando informado', async () => {
    const { repo, findMany } = build();
    await repo.getOldPosts('org-1', '2026-10-26T00:00:00Z', 'prof-2');
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      profileId: 'prof-2',
    });
  });

  it('sem perfil (admin) nao filtra por perfil', async () => {
    const { repo, findMany } = build();
    await repo.getOldPosts('org-1', '2026-10-26T00:00:00Z');
    expect(findMany.mock.calls[0][0].where.profileId).toBeUndefined();
  });
});

// O id devolvido (e usado para encerrar workflows) precisa ser de um post que
// o chamador alcanca: com perfil, o grupo de outro perfil nao e apagado nem
// devolvido.
describe('PostsRepository.deletePost (escopo por perfil)', () => {
  const build = () => {
    const prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).updateMany = jest.fn().mockResolvedValue({ count: 0 });
    (prismaMock.model.post as any).findFirst = jest.fn().mockResolvedValue(null);
    const repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    return {
      repo,
      updateMany: prismaMock.model.post.updateMany as jest.Mock,
      findFirst: prismaMock.model.post.findFirst as jest.Mock,
    };
  };

  it('aplica o perfil tanto no soft delete quanto na busca do post devolvido', async () => {
    const { repo, updateMany, findFirst } = build();
    await repo.deletePost('org-1', 'g1', 'prof-1');
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ group: 'g1', profileId: 'prof-1' });
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      group: 'g1',
      parentPostId: null,
      profileId: 'prof-1',
    });
  });

  it('sem perfil (admin/chave de org) nao filtra por perfil', async () => {
    const { repo, findFirst } = build();
    await repo.deletePost('org-1', 'g1');
    expect(findFirst.mock.calls[0][0].where.profileId).toBeUndefined();
  });
});

// #2119: o calendario mostra o motivo da falha — so a mensagem curada.
describe('PostsRepository.getPosts (erro curado)', () => {
  it('seleciona error e devolve so a mensagem curada de bad_body', async () => {
    const prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).findMany = jest.fn().mockResolvedValue([
      {
        id: 'p1',
        publishDate: new Date('2026-10-27T10:00:00Z'),
        intervalInDays: null,
        state: 'ERROR',
        error: JSON.stringify({ cause: { type: 'bad_body', failure: { message: 'Vídeo recusado' } } }),
      },
      {
        id: 'p2',
        publishDate: new Date('2026-10-27T11:00:00Z'),
        intervalInDays: null,
        state: 'ERROR',
        error: '{"refresh_token":"SECRET"}',
      },
    ]);
    const repo = new PostsRepository(prismaMock as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const list: any[] = await repo.getPosts('org-1', {
      startDate: '2026-10-26T00:00:00Z',
      endDate: '2026-11-02T00:00:00Z',
    } as any);

    const select = (prismaMock.model.post.findMany as jest.Mock).mock.calls[0][0].select;
    expect(select.error).toBe(true);
    expect(list.find((p) => p.id === 'p1').error).toBe('Vídeo recusado');
    expect(list.find((p) => p.id === 'p2').error).toBeNull();
    expect(JSON.stringify(list)).not.toContain('SECRET');
  });
});

// Porte do upstream #1827: tag apagada (soft delete) some dos posts e perde os
// vinculos.
describe('PostsRepository - tags apagadas', () => {
  it('getPosts so traz tags nao apagadas', async () => {
    const prismaMock = createPrismaRepositoryMock('post');
    (prismaMock.model.post as any).findMany = jest.fn().mockResolvedValue([]);
    const repo = new PostsRepository(prismaMock as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await repo.getPosts('org-1', { startDate: '2026-10-26T00:00:00Z', endDate: '2026-11-02T00:00:00Z' } as any);
    const select = (prismaMock.model.post.findMany as jest.Mock).mock.calls[0][0].select;
    expect(select.tags).toMatchObject({ where: { tag: { deletedAt: null } } });
  });

  it('deleteTag remove os vinculos da tag com os posts', async () => {
    const tags = { update: jest.fn().mockResolvedValue({ id: 'tag-1' }) };
    const tagsPosts = { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) };
    const repo = new PostsRepository(
      {} as any,
      {} as any,
      {} as any,
      { model: { tags } } as any,
      { model: { tagsPosts } } as any,
      {} as any
    );
    await expect(repo.deleteTag('tag-1', 'org-1', 'prof-1')).resolves.toEqual({ id: 'tag-1' });
    expect(tags.update.mock.calls[0][0].where).toEqual({ id: 'tag-1', orgId: 'org-1', profileId: 'prof-1' });
    expect(tagsPosts.deleteMany).toHaveBeenCalledWith({ where: { tagId: 'tag-1' } });
  });
});

// Porte do upstream #2205: filtro de canais acima do calendario.
describe('PostsRepository.getPostsList (filtro de canais)', () => {
  const build = () => {
    const prismaMock = createPrismaRepositoryMock('post');
    prismaMock.model.post.findMany.mockResolvedValue([]);
    prismaMock.model.post.count.mockResolvedValue(0);
    const repo = new PostsRepository(
      prismaMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    return { prismaMock, repo };
  };

  it('restringe aos canais escolhidos sem perder org, perfil e cliente', async () => {
    const { prismaMock, repo } = build();

    await repo.getPostsList(
      'org-1',
      { customer: 'cli-1', integrations: ['int-1', 'int-2'] } as any,
      'perfil-1'
    );

    const where = prismaMock.model.post.findMany.mock.calls[0][0]!.where as any;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ organizationId: 'org-1' }] },
        { profileId: 'perfil-1' },
      ])
    );
    expect(where.integration).toEqual({
      customerId: 'cli-1',
      id: { in: ['int-1', 'int-2'] },
    });
  });

  it('sem canais escolhidos nao filtra por canal', async () => {
    const { prismaMock, repo } = build();

    await repo.getPostsList('org-1', { integrations: [] } as any);

    const where = prismaMock.model.post.findMany.mock.calls[0][0]!.where as any;
    expect(where.integration).toBeUndefined();
  });
});

// Porte do upstream #2212: conectar o post a mao tambem grava o link.
describe('PostsRepository.updateReleaseId (link do post conectado)', () => {
  it('grava o link junto do id so quando ele vem, sempre restrito a org e a posts missing', async () => {
    const post = createPrismaRepositoryMock('post');
    const tx = {
      post: { update: jest.fn().mockResolvedValue({ id: 'p', integrationId: 'i', organizationId: 'o', profileId: null }) },
      scheduledAutomationTarget: { updateMany: jest.fn() },
    };
    const transaction = { model: { $transaction: jest.fn(async (cb: any) => cb(tx)) } };
    const repo = new PostsRepository(post as any, {} as any, {} as any, {} as any, {} as any, {} as any, transaction as any);

    await repo.updateReleaseId('p', 'o', '123', 'https://www.tiktok.com/@perfil/video/123');
    await repo.updateReleaseId('p', 'o', '456');

    expect(tx.post.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'p', organizationId: 'o', releaseId: 'missing' },
      data: { releaseId: '123', releaseURL: 'https://www.tiktok.com/@perfil/video/123' },
    });
    expect(tx.post.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'p', organizationId: 'o', releaseId: 'missing' },
      data: { releaseId: '456' },
    });
  });
});
