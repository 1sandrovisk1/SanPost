import { describe, expect, it, vi } from 'vitest';
import { skipDragsInsideEditor } from '../launches/helpers/editor.drag.guard';

const drag = (inside: boolean, files = false, prevented = false) => ({
  composedPath: () => [{}, { isContentEditable: inside }],
  dataTransfer: { types: files ? ['Files'] : ['text/plain'] },
  defaultPrevented: prevented,
  preventDefault: vi.fn(),
} as unknown as DragEvent);

describe('arrastar no editor junto do calendario', () => {
  it('preserva os eventos de arrastar do calendario fora do editor', () => {
    const handler = vi.fn();
    const backend = skipDragsInsideEditor({ handleTopDrop: handler });
    const event = drag(false, true);

    backend.handleTopDrop(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('permite mover texto e imagem dentro do editor sem o calendario cancelar', () => {
    const start = vi.fn();
    const over = vi.fn();
    const drop = vi.fn();
    const backend = skipDragsInsideEditor({
      handleTopDragStart: start,
      handleTopDragOverCapture: over,
      handleTopDrop: drop,
    });
    const event = drag(true);

    backend.handleTopDragStart(event);
    backend.handleTopDragOverCapture(event);
    backend.handleTopDrop(event);

    expect(start).not.toHaveBeenCalled();
    expect(over).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('impede abrir na aba um arquivo que o editor nao recebeu', () => {
    const handler = vi.fn();
    const backend = skipDragsInsideEditor({ handleTopDrop: handler });
    const event = drag(true, true);

    backend.handleTopDrop(event);

    expect(handler).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('nao interfere no arquivo que o editor ou dropzone ja recebeu', () => {
    const backend = skipDragsInsideEditor({ handleTopDrop: vi.fn() });
    const event = drag(true, true, true);

    backend.handleTopDrop(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
