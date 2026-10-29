// Ajuste do backend HTML5 do react-dnd para o editor de posts (upstream
// 2aae02fe). Arquivo puro para o vitest do composer.

export const DRAG_HANDLERS = [
  'handleTopDragStart',
  'handleTopDragStartCapture',
  'handleTopDragEndCapture',
  'handleTopDragEnter',
  'handleTopDragEnterCapture',
  'handleTopDragLeaveCapture',
  'handleTopDragOver',
  'handleTopDragOverCapture',
  'handleTopDrop',
  'handleTopDropCapture',
];

// the path is kept from the start of the dispatch, the editor can re-render
// the target out of the page before the event bubbles up to the window
export const isInsideEditor = (event: Event) =>
  event
    .composedPath()
    .some((node) => !!(node as HTMLElement)?.isContentEditable);

const isFileDrag = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types || []).includes('Files');

// the backend listens to every drag on the window and cancels the native drops
// it doesn't own, so dragging text or pictures inside the post editor did
// nothing. Inside the editor its handlers are skipped; ProseMirror and the
// dropzone take what they accept. Fork: a file drop nobody took (an editor
// without media, where the dropzone has noDrag) is still cancelled, as
// react-dnd did, so the browser doesn't open the file in the tab.
export const skipDragsInsideEditor = <T extends object>(backend: T): T => {
  const target = backend as Record<string, unknown>;
  for (const name of DRAG_HANDLERS) {
    const handler = target[name];
    if (typeof handler !== 'function') {
      continue;
    }

    target[name] = (event: DragEvent) => {
      if (!isInsideEditor(event)) {
        handler(event);
        return;
      }

      if (
        name === 'handleTopDrop' &&
        !event.defaultPrevented &&
        isFileDrag(event)
      ) {
        event.preventDefault();
      }
    };
  }

  return backend;
};
