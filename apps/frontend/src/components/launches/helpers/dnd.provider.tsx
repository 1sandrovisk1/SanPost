'use client';

import { FC, ReactNode } from 'react';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DndProvider } from 'react-dnd';
import { skipDragsInsideEditor } from '@gitroom/frontend/components/launches/helpers/editor.drag.guard';

// dragging text or pictures inside the post editor must not be cancelled by
// the calendar's drag and drop (see editor.drag.guard.ts)
const CalendarBackend: typeof HTML5Backend = (manager, context, options) =>
  skipDragsInsideEditor(HTML5Backend(manager, context, options));

export const DNDProvider: FC<{
  children: ReactNode;
}> = ({ children }) => {
  return <DndProvider backend={CalendarBackend}>{children}</DndProvider>;
};
