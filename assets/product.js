/**
 * Product page components.
 *
 * <variant-picker>  reports the chosen option value ids.
 * <product-info>    re-renders the product section for that selection through
 *                   the Section Rendering API (`?option_values=…&section_id=…`)
 *                   and swaps every element marked `data-product-update`.
 * <product-form>    adds to cart with the Ajax Cart API and opens the drawer.
 * <media-gallery>   thumbnails, swipe position and the selected variant's image.
 */
import { EVENTS, announce, dispatch, fetchSection, getConfig, isAbortError } from '@theme/utils';
import { addToCart } from '@theme/cart-api';

class VariantPicker extends HTMLElement {
  connectedCallback() {
    this.addEventListener('change', this.onChange);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
  }

  onChange = (event) => {
    const changed = event.target instanceof HTMLSelectElement ? event.target.selectedOptions[0] : event.target;
    if (!changed?.dataset.optionValueId) return;

    const optionValueIds = [...this.querySelectorAll('input:checked, select')]
      .map((control) => (control instanceof HTMLSelectElement ? control.selectedOptions[0] : control))
      .map((control) => control?.dataset.optionValueId)
      .filter(Boolean);

    this.dispatchEvent(
      new CustomEvent('variant-picker:change', {
        bubbles: true,
        detail: {
          optionValueIds,
          // Values that belong to another product of a combined listing carry its URL.
          productUrl: changed.dataset.productUrl || this.dataset.productUrl,
          focusValueId: changed.dataset.optionValueId,
        },
      }),
    );
  };
}

class ProductInfo extends HTMLElement {
  connectedCallback() {
    this.addEventListener('variant-picker:change', this.onVariantChange);
  }

  disconnectedCallback() {
    this.removeEventListener('variant-picker:change', this.onVariantChange);
    this.controller?.abort();
  }

  onVariantChange = async ({ detail }) => {
    const url = new URL(detail.productUrl, window.location.origin);
    url.searchParams.set('option_values', detail.optionValueIds.join(','));

    // Another product of a combined listing: load its page.
    if (detail.productUrl !== this.dataset.productUrl) {
      window.location.assign(url);
      return;
    }

    this.controller?.abort();
    this.controller = new AbortController();
    this.setAttribute('aria-busy', 'true');

    try {
      const html = await fetchSection(url, this.dataset.sectionId, this.controller.signal);
      const fresh = html.querySelector('product-info');
      if (!fresh) throw new Error('The product section came back without product information.');

      const quantity = this.querySelector('input[name="quantity"]')?.value;
      this.swap(fresh);
      this.restoreQuantity(quantity);
      this.restoreFocus(detail.focusValueId);

      const variant = JSON.parse(fresh.querySelector('[data-selected-variant]')?.textContent || 'null');
      if (variant) {
        const address = new URL(window.location.href);
        address.searchParams.set('variant', variant.id);
        window.history.replaceState(window.history.state, '', address);
      } else {
        announce(getConfig().strings?.variantUnavailable);
      }
      dispatch(EVENTS.variantChange, { sectionId: this.dataset.sectionId, variant });

      // Dynamic checkout buttons are rendered by Shopify's script; re-run it for the new markup.
      window.Shopify?.PaymentButton?.init?.();
    } catch (error) {
      if (!isAbortError(error)) window.location.assign(url);
    } finally {
      this.removeAttribute('aria-busy');
    }
  };

  swap(fresh) {
    this.querySelectorAll('[data-product-update]').forEach((element) => {
      const key = CSS.escape(element.dataset.productUpdate);
      const replacement = fresh.querySelector(`[data-product-update="${key}"]`);
      if (replacement) element.replaceWith(document.importNode(replacement, true));
    });
  }

  /** Keeps the quantity a shopper typed if the new variant's quantity rules allow it. */
  restoreQuantity(previous) {
    const input = this.querySelector('input[name="quantity"]');
    if (!input || !previous) return;
    const value = Number(previous);
    const min = Number(input.min || 1);
    const max = input.max ? Number(input.max) : Infinity;
    const step = Number(input.step || 1);
    if (value >= min && value <= max && (value - min) % step === 0) {
      input.value = previous;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /** The picker was replaced: put focus back on the value the shopper chose. */
  restoreFocus(valueId) {
    if (!valueId) return;
    const control = this.querySelector(`[data-option-value-id="${CSS.escape(valueId)}"]`);
    const target = control instanceof HTMLOptionElement ? control.closest('select') : control;
    target?.focus({ preventScroll: true });
  }
}

class ProductForm extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('form');
    this.form?.addEventListener('submit', this.onSubmit);
  }

  disconnectedCallback() {
    this.form?.removeEventListener('submit', this.onSubmit);
  }

  onSubmit = async (event) => {
    event.preventDefault();
    const button = this.form.querySelector('[type="submit"]');
    const error = this.querySelector('[data-form-error]');
    if (!button || button.disabled || button.getAttribute('aria-busy') === 'true') return;

    error.hidden = true;
    button.setAttribute('aria-busy', 'true');
    try {
      await addToCart(new FormData(this.form));
      const config = getConfig();
      if (config.cartType === 'drawer' && document.getElementById('CartDrawer')) {
        dispatch(EVENTS.cartOpen, { opener: button });
        announce(config.strings?.addedToCart);
      } else {
        window.location.assign(config.routes.cart);
      }
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      button.removeAttribute('aria-busy');
    }
  };
}

class MediaGallery extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-track]');
    this.thumbnails = [...this.querySelectorAll('[data-target]')];
    this.addEventListener('click', this.onThumbnailClick);
    document.addEventListener(EVENTS.variantChange, this.onVariantChange);

    this.observer = new IntersectionObserver(this.onIntersect, { root: this.track, threshold: 0.6 });
    this.track.querySelectorAll('[data-media-id]').forEach((item) => this.observer.observe(item));

    if (this.dataset.activeMediaId) this.scrollToMedia(this.dataset.activeMediaId, 'instant');
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    document.removeEventListener(EVENTS.variantChange, this.onVariantChange);
  }

  onThumbnailClick = (event) => {
    const thumbnail = event.target.closest('[data-target]');
    if (thumbnail) this.scrollToItem(document.getElementById(thumbnail.dataset.target));
  };

  onIntersect = (entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry) => {
        this.thumbnails.forEach((thumbnail) => {
          thumbnail.setAttribute('aria-current', String(thumbnail.dataset.target === entry.target.id));
        });
        // Pause a video that has been swiped away.
        this.track.querySelectorAll('video').forEach((video) => {
          if (!entry.target.contains(video)) video.pause();
        });
      });
  };

  onVariantChange = ({ detail }) => {
    if (this.closest('product-info')?.dataset.sectionId !== detail.sectionId) return;
    const mediaId = detail.variant?.featured_media?.id;
    if (mediaId) this.scrollToMedia(mediaId);
  };

  scrollToMedia(mediaId, behavior = 'smooth') {
    const item = this.track.querySelector(`[data-media-id="${CSS.escape(String(mediaId))}"]`);
    if (item) this.scrollToItem(item, behavior);
  }

  scrollToItem(item, behavior = 'smooth') {
    if (!item) return;
    this.track.scrollTo({ left: item.offsetLeft, behavior });
  }
}

const components = {
  'variant-picker': VariantPicker,
  'product-info': ProductInfo,
  'product-form': ProductForm,
  'media-gallery': MediaGallery,
};

Object.entries(components).forEach(([name, component]) => {
  if (!customElements.get(name)) customElements.define(name, component);
});
