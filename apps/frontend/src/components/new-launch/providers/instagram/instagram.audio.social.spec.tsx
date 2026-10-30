import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {FormProvider,useForm,useFormContext,useWatch} from 'react-hook-form';
const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@gitroom/frontend/components/launches/helpers/use.custom.provider.function',()=>({useCustomProviderFunction:()=>({get})}));
vi.mock('@gitroom/frontend/components/launches/helpers/use.values',()=>({useSettings:()=>useFormContext()}));
vi.mock('@gitroom/react/translation/get.transation.service.client',()=>({useT:()=> (_key:string,fallback:string)=>fallback}));
import {InstagramAudioSelector} from './instagram.audio';
function Data(){return <output data-testid="saved">{JSON.stringify(useWatch())}</output>;}
function Harness({audio,disabled=false}:{audio?:any;disabled?:boolean}){const form=useForm({defaultValues:{audio}});return <FormProvider {...form}><InstagramAudioSelector disabled={disabled}/><Data/></FormProvider>;}
describe('seletor de audio do Reel',()=>{
 beforeEach(()=>{get.mockReset();get.mockResolvedValue([{id:'123',title:'Musica teste',artist:'Autor'}]);});afterEach(cleanup);
 it('restaura selecao e conserva volume zero ao editar',()=>{
  render(<Harness audio={{id:'123',title:'Salvo',audio_volume:0,video_volume:90}}/>);expect(screen.getByText('Salvo')).toBeTruthy();expect((screen.getByLabelText('Audio volume') as HTMLInputElement).value).toBe('0');fireEvent.change(screen.getByLabelText('Original video volume'),{target:{value:'0'}});expect(screen.getByTestId('saved').textContent).toContain('"video_volume":0');
 });
 it('busca tendencias e persiste o ID escolhido',async()=>{
  render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Add audio'}));await waitFor(()=>expect(screen.getByText('Musica teste')).toBeTruthy(),{timeout:3000});expect(get).toHaveBeenCalledWith('audioSearch',{q:'',type:'music'});fireEvent.click(screen.getByText('Musica teste'));expect(screen.getByTestId('saved').textContent).toContain('"id":"123"');
 });
 it('falha de busca aparece como erro e nao como lista vazia',async()=>{
  get.mockResolvedValue({message:'Forbidden'});render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Add audio'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Reconnect'),{timeout:3000});expect(screen.queryByText('No audio found')).toBeNull();
 });
 it('selecao incompatível fica visivel e pode ser removida',()=>{
  render(<Harness disabled audio={{id:'123',title:'Salvo'}}/>);expect(screen.getByText('Salvo')).toBeTruthy();expect((screen.getByLabelText('Audio volume') as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Remove audio'}));expect(screen.getByTestId('saved').textContent).toBe('{}');expect(get).not.toHaveBeenCalled();
 });
});
