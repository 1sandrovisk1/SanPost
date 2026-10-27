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
  await repo.updateReleaseId('local','o','123_789');
  expect(tx.post.update).toHaveBeenLastCalledWith({where:{id:'local',organizationId:'o',releaseId:'missing'},data:{releaseId:'123_789'}});
  expect(tx.scheduledAutomationTarget.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:{publishedReleaseId:'123_789'}}));
 });
});
