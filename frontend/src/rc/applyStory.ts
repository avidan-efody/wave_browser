/**
 * Parent links for the story panel. These are not part of signal.rc.
 */

import { useWaveformStore } from '../store';

export interface StoryLink {
  child: string;
  parent: string;
}

export function applyStoryLinks(links: StoryLink[]): number {
  let linked = 0;
  for (const link of links) {
    const state = useWaveformStore.getState();
    const items = [
      ...state.markers.map((marker) => ({ id: marker.id, label: marker.name })),
      ...state.notes.map((note) => ({ id: note.id, label: note.text })),
    ];
    const child = items.find((item) => item.label === link.child);
    const parent = items.find((item) => item.label === link.parent);
    if (!child || !parent) continue;
    state.setStoryParent(child.id, parent.id);
    const after = [
      ...useWaveformStore.getState().markers,
      ...useWaveformStore.getState().notes,
    ].find((item) => item.id === child.id);
    if (after?.parentId === parent.id) linked += 1;
  }
  return linked;
}
