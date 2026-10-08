/**
 * Cart components, shared by the drawer and the cart page.
 *
 * <cart-section>  swaps its `data-cart-content` with the fresh HTML that every
 *                 Cart API response carries for it (bundled section rendering).
 * <cart-drawer>   a <cart-section> inside a <dialog>, opened on `cart:open`.
 * <cart-items>    quantity changes and removals, one line at a time, keyed by
 *                 line item key so concurrent edits never hit the wrong line.
 */
import { EVENTS, announce, debounce, getConfig, openDialog, parseHTML } from '@theme/utils';
import { changeLine, updateNote } from '@theme/cart-api';

class CartSection extends HTMLElement {
  connectedCallback() {
    document.addEventListener(EVENTS.cartUpdated, this.onCartUpdated);
    this.addEventListener('input', this.onNoteInput);
  }

  disconnectedCallback() {
    document.removeEventListener(EVENTS.cartUpdated, this.onCartUpdated);
  }

  onCartUpdated = ({ detail }) => {
    const html = detail.sections?.[this.dataset.cartSection];
    if (!html) return;
    const fresh = parseHTML(html).querySelector('[data-cart-content]');
    const current = this.querySelector('[data-cart-content]');
    if (!fresh || !current) return;

    const focus = this.describeFocus();
    current.replaceWith(document.importNode(fresh, true));
    this.restoreFocus(focus);
  };

  /** Where focus is before the swap: which control of which line (−, +, the field, remove). */
  describeFocus() {
    const active = document.activeElement;
    if (!this.contains(active)) return null;
    const line = active.closest('[data-line-key]');
    if (!line) return { other: true };
    let control = '[data-remove-line]';
    if (active.matches('input')) control = 'input[data-line-key]';
    else if (active.matches('button[name]')) control = `button[name="${active.name}"]`;
    return { key: line.dataset.lineKey, control };
  }

  /** Puts focus back on the same control of the same line, or on the cart title if the line is gone. */
  restoreFocus(focus) {
    if (!focus) return;
    const line = focus.key && this.querySelector(`[data-line-key="${CSS.escape(focus.key)}"]`);
    let target = line?.querySelector(focus.control);
    // A − or + button may now be disabled (minimum reached): fall back to the field.
    if (target?.disabled) target = line.querySelector('input[data-line-key]');
    (target || this.querySelector('h1[tabindex], h2[tabindex]'))?.focus({ preventScroll: true });
  }

  onNoteInput = debounce((event) => {
    if (event.target.matches('[data-cart-note]')) updateNote(event.target.value).catch(() => {});
  }, 500);
}

class CartDrawer extends CartSection {
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(EVENTS.cartOpen, this.onOpen);
    // Theme editor: show the drawer while its section is selected.
    document.addEventListener('shopify:section:select', this.onEditorSelect);
    document.addEventListener('shopify:section:deselect', this.onEditorDeselect);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(EVENTS.cartOpen, this.onOpen);
    document.removeEventListener('shopify:section:select', this.onEditorSelect);
    document.removeEventListener('shopify:section:deselect', this.onEditorDeselect);
  }

  get dialog() {
    return this.querySelector('dialog');
  }

  onOpen = ({ detail }) => {
    openDialog(this.dialog, detail?.opener);
  };

  onEditorSelect = ({ detail }) => {
    if (detail.sectionId === this.dataset.cartSection) openDialog(this.dialog);
  };

  onEditorDeselect = ({ detail }) => {
    if (detail.sectionId === this.dataset.cartSection) this.dialog?.close();
  };
}

class CartItems extends HTMLElement {
  connectedCallback() {
    this.pending = new Map();
    this.addEventListener('change', this.onChange);
    this.addEventListener('click', this.onClick);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('click', this.onClick);
  }

  onChange = (event) => {
    const input = event.target.closest('input[data-line-key]');
    if (!input) return;
    const key = input.dataset.lineKey;
    clearTimeout(this.pending.get(key));
    // An emptied field is not a request to remove the line: wait for a number.
    if (input.value.trim() === '' || Number.isNaN(Number(input.value))) return;
    // Wait for the shopper to stop clicking + or − before asking the server.
    this.pending.set(
      key,
      setTimeout(() => this.update(key, Number(input.value)), 350),
    );
  };

  onClick = (event) => {
    const remove = event.target.closest('[data-remove-line]');
    if (!remove) return;
    event.preventDefault();
    this.update(remove.dataset.removeLine, 0);
  };

  /** The line as it is in the page now: another response may have re-rendered it. */
  findLine(key) {
    return document.querySelector(`[data-cart-content] [data-line-key="${CSS.escape(key)}"]`);
  }

  async update(key, quantity) {
    const line = this.findLine(key);
    line?.setAttribute('aria-busy', 'true');
    const previousError = line?.querySelector('[data-line-error]');
    if (previousError) previousError.hidden = true;

    try {
      await changeLine(key, quantity);
      announce(getConfig().strings?.cartUpdated);
    } catch (failure) {
      // Nothing was re-rendered: show why and put the last saved quantity back.
      const current = this.findLine(key);
      const input = current?.querySelector('input[data-line-key]');
      if (input) {
        input.value = input.dataset.quantity;
        input.dispatchEvent(new Event('change'));
      }
      const error = current?.querySelector('[data-line-error]');
      if (error) {
        error.textContent = failure.message;
        error.hidden = false;
      }
      announce(failure.message);
    } finally {
      this.findLine(key)?.removeAttribute('aria-busy');
    }
  }
}

const components = { 'cart-section': CartSection, 'cart-drawer': CartDrawer, 'cart-items': CartItems };
Object.entries(components).forEach(([name, component]) => {
  if (!customElements.get(name)) customElements.define(name, component);
});
