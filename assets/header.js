/**
 * Header behaviors: a shadow once the sticky header leaves the top, dropdown
 * menus that close like menus should, and the cart count kept in sync with
 * every cart change.
 */
import { EVENTS, parseHTML } from '@theme/utils';

class StickyHeader extends HTMLElement {
  connectedCallback() {
    this.dropdowns = [...this.querySelectorAll('[data-header-dropdown]')];
    this.dropdowns.forEach((dropdown) => dropdown.addEventListener('toggle', this.onToggle));
    this.addEventListener('keyup', this.onKeyup);
    this.addEventListener('focusout', this.onFocusout);
    document.addEventListener('click', this.onDocumentClick);

    if (this.hasAttribute('data-sticky')) {
      // The sticky element is Shopify's section wrapper, so watch the spot just above it.
      this.sentinel = document.createElement('div');
      this.sentinel.setAttribute('aria-hidden', 'true');
      (this.closest('.shopify-section') || this).before(this.sentinel);
      this.observer = new IntersectionObserver(([entry]) => {
        this.classList.toggle('is-scrolled', !entry.isIntersecting);
      });
      this.observer.observe(this.sentinel);
    }
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.onDocumentClick);
    this.observer?.disconnect();
    this.sentinel?.remove();
  }

  /** One dropdown open at a time. */
  onToggle = (event) => {
    if (!event.target.open) return;
    this.dropdowns.forEach((dropdown) => {
      if (dropdown !== event.target) dropdown.open = false;
    });
  };

  onKeyup = (event) => {
    if (event.key !== 'Escape') return;
    const open = event.target.closest('[data-header-dropdown][open]');
    if (!open) return;
    open.open = false;
    open.querySelector('summary').focus();
  };

  /** Tabbing out of a dropdown closes it. */
  onFocusout = (event) => {
    const dropdown = event.target.closest('[data-header-dropdown][open]');
    if (dropdown && !dropdown.contains(event.relatedTarget)) dropdown.open = false;
  };

  onDocumentClick = (event) => {
    this.dropdowns.forEach((dropdown) => {
      if (dropdown.open && !dropdown.contains(event.target)) dropdown.open = false;
    });
  };
}

if (!customElements.get('sticky-header')) customElements.define('sticky-header', StickyHeader);

/**
 * The /cart/change.js response carries `item_count`; /cart/add.js returns the
 * added line instead, so the count is read from the re-rendered drawer.
 */
function itemCountFrom(detail) {
  if (Number.isInteger(detail.itemCount)) return detail.itemCount;
  for (const html of Object.values(detail.sections || {})) {
    const element = html && parseHTML(html).querySelector('[data-item-count]');
    if (element) return Number(element.dataset.itemCount);
  }
  return null;
}

document.addEventListener(EVENTS.cartUpdated, ({ detail }) => {
  const count = itemCountFrom(detail);
  if (count === null) return;
  document.querySelectorAll('[data-cart-count]').forEach((bubble) => {
    bubble.textContent = count;
    bubble.hidden = count === 0;
  });
});
