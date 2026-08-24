export const COMPACT_DIALOG_IDS = new Set([
  'tag-picker-dialog',
  'tags-dialog',
  'tag-results-dialog',
  'tag-manage-dialog',
  'tag-delete-dialog',
  'tag-filter-dialog',
  'bulk-tags-dialog',
]);

export function sizeCompactDialog(dialog, {
  computedStyle = globalThis.getComputedStyle,
  viewportHeight = globalThis.innerHeight,
} = {}) {
  if (!COMPACT_DIALOG_IDS.has(dialog.id) || !dialog.open) return;
  dialog.style.display = 'block';
  dialog.style.setProperty('height', '1px', 'important');
  dialog.style.setProperty('max-height', 'none', 'important');
  const natural = [...dialog.children].reduce((sum, node) => {
    const style = computedStyle(node);
    return sum + node.offsetHeight
      + (parseFloat(style.marginTop) || 0)
      + (parseFloat(style.marginBottom) || 0);
  }, 0);
  const cap = Math.max(240, viewportHeight - 24);
  dialog.style.setProperty('height', `${Math.min(Math.ceil(natural), cap)}px`, 'important');
  dialog.style.setProperty('max-height', `${cap}px`, 'important');
}

export function clearCompactDialogSize(dialog) {
  if (!COMPACT_DIALOG_IDS.has(dialog.id)) return;
  dialog.style.removeProperty('display');
  dialog.style.removeProperty('height');
  dialog.style.removeProperty('max-height');
}

export function dialogTextEntry(element) {
  return element?.matches?.('textarea,[contenteditable="true"],input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="submit"])');
}

export function dialogSafeInitialFocus(dialog, requested, documentRef = globalThis.document) {
  if (requested && !dialogTextEntry(requested)) return requested;
  const labelled = dialog.getAttribute('aria-labelledby');
  const title = labelled && documentRef.getElementById(labelled);
  if (title) {
    if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    return title;
  }
  return dialog.querySelector('[data-close],.icon-close,button:not([disabled]),[tabindex]:not([tabindex="-1"]):not(input):not(textarea)');
}

export function syncDialogScrollLock(documentRef = globalThis.document) {
  const open = documentRef.querySelector('dialog[open]');
  documentRef.documentElement.classList.toggle('dialog-scroll-lock', Boolean(open));
  documentRef.body.classList.toggle('dialog-scroll-lock', Boolean(open));
}
