// src/lib/stores/editMode.svelte.ts

const _state = $state({ active: false });

export const editModeState = _state;

export function toggleEditMode() {
  _state.active = !_state.active;
}

export function exitEditMode() {
  _state.active = false;
}
