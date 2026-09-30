/*! agentic-report script: modal */
/** Modal dialogs (`:::modal`): the opener opens the native dialog, and closing returns focus to it. */

import { provideFeature } from '../features.js';

const modalOpeners = new WeakMap<HTMLDialogElement, HTMLButtonElement>();

provideFeature('modal', {
  open: (modalOpen) => {
    const dialog = document.getElementById(
      modalOpen.dataset.modalOpen ?? '',
    ) as HTMLDialogElement | null;
    if (dialog !== null) {
      modalOpeners.set(dialog, modalOpen);
      dialog.showModal();
    }
  },
  close: (modalClose) => {
    modalClose.closest<HTMLDialogElement>('dialog')?.close();
  },
  closed: (dialog) => {
    modalOpeners.get(dialog)?.focus();
  },
});
