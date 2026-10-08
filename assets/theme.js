/**
 * Small page-wide behaviors loaded on every page. Components with more logic
 * (header, product, cart, filters, search) ship as their own modules, loaded
 * only by the sections that use them.
 */
import { openDialog } from '@theme/utils';

// Country and language selectors submit as soon as a value is picked.
// The form still works without JavaScript through its <noscript> button.
document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-auto-submit]');
  if (select?.form) select.form.requestSubmit();
});

/**
 * Drawers and modals are native <dialog> elements: focus trapping, Escape and
 * the top layer come from the browser. A trigger names its dialog with
 * `data-dialog-open="DialogId"`; it can be a link, so it still leads to a real
 * page (/cart, /search) before this script runs.
 */
document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-dialog-open]');
  if (opener) {
    const dialog = document.getElementById(opener.dataset.dialogOpen);
    if (!(dialog instanceof HTMLDialogElement)) return;
    event.preventDefault();
    openDialog(dialog, opener);
    return;
  }

  if (event.target.closest('[data-dialog-close]')) {
    event.target.closest('dialog')?.close();
    return;
  }

  // A click on the backdrop lands on the <dialog> itself, outside its box. It
  // only counts when the press started there too, so selecting text inside a
  // dialog and releasing over the backdrop does not close it.
  const dialog = event.target;
  if (dialog instanceof HTMLDialogElement && dialog.open && pressStartedOnBackdrop) {
    if (isOutside(dialog, event)) dialog.close();
  }
});

let pressStartedOnBackdrop = false;
document.addEventListener('pointerdown', (event) => {
  const dialog = event.target;
  pressStartedOnBackdrop = dialog instanceof HTMLDialogElement && dialog.open && isOutside(dialog, event);
});

function isOutside(dialog, event) {
  const box = dialog.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}

/**
 * <quantity-input>: the − and + buttons step the number field while respecting
 * its min, max and step (Shopify quantity rules), then fire a `change` event so
 * product forms and cart lines can react to one event.
 */
class QuantityInput extends HTMLElement {
  connectedCallback() {
    this.input = this.querySelector('input');
    this.addEventListener('click', this.onClick);
    this.input.addEventListener('change', () => this.updateButtons());
    this.updateButtons();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
  }

  onClick = (event) => {
    const button = event.target.closest('button[name]');
    if (!button) return;
    event.preventDefault();
    const previous = this.input.value;
    if (button.name === 'plus') this.input.stepUp();
    else this.input.stepDown();
    if (previous !== this.input.value) this.input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  updateButtons() {
    const value = Number(this.input.value);
    const min = Number(this.input.min || 0);
    const max = this.input.max ? Number(this.input.max) : Infinity;
    this.querySelector('button[name="minus"]')?.toggleAttribute('disabled', value <= min);
    this.querySelector('button[name="plus"]')?.toggleAttribute('disabled', value >= max);
  }
}

if (!customElements.get('quantity-input')) customElements.define('quantity-input', QuantityInput);
