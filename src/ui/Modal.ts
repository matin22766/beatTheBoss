import { h } from './dom';

export interface ModalHandle {
  root: HTMLElement;
  body: HTMLElement;
  close(): void;
  setContent(...nodes: Node[]): void;
}

/** Generic overlay + card with a title and close button. Esc and backdrop clicks close it. */
export function openModal(parent: HTMLElement, title: string, sub: string, onClose?: () => void, extraClass = ''): ModalHandle {
  const body = h('div', { class: 'modal-body' });
  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const card = h(
    'div',
    { class: `modal ${extraClass}`, role: 'dialog', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('div', {}, h('h2', { text: title }), h('p', { class: 'sub', text: sub })), h('button', { class: 'close', text: '✕', 'aria-label': 'Close', onclick: close })),
    body,
  );
  const overlay: HTMLElement = h('div', { class: 'overlay', onclick: (e: Event) => e.target === overlay && close() }, card);
  parent.append(overlay);
  window.addEventListener('keydown', onKey);
  return { root: card, body, close, setContent: (...nodes) => body.replaceChildren(...nodes) };
}
