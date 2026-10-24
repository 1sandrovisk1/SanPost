import {
  isThirdPartyFunctionCallable,
  ThirdPartyAbstract,
} from './thirdparty.interface';

class FakeThirdParty extends ThirdPartyAbstract<{ text: string }> {
  async checkConnection() {
    return { name: 'n', username: 'u', id: 'i' };
  }

  async sendData() {
    return 'ok';
  }

  async voices(_apiKey: string): Promise<string[]> {
    return [];
  }
}

describe('isThirdPartyFunctionCallable', () => {
  const instance = new FakeThirdParty();

  it.each(['voices', 'checkConnection', 'sendData'])(
    'permite %s declarado na classe do provider',
    (name) => {
      expect(isThirdPartyFunctionCallable(instance, name)).toBe(true);
    }
  );

  it.each([
    'constructor',
    'toString',
    'hasOwnProperty',
    'valueOf',
    '__proto__',
    '__defineGetter__',
    'naoExiste',
    '',
  ])('bloqueia %s', (name) => {
    expect(isThirdPartyFunctionCallable(instance, name)).toBe(false);
  });

  it('bloqueia nomes que nao sao string e instancia ausente', () => {
    expect(isThirdPartyFunctionCallable(instance, undefined)).toBe(false);
    expect(isThirdPartyFunctionCallable(instance, ['voices'])).toBe(false);
    expect(isThirdPartyFunctionCallable(undefined, 'voices')).toBe(false);
  });
});
