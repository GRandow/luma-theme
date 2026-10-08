/**
 * <product-recommendations>: fills itself with Shopify's recommendations
 * once it gets close to the viewport. The markup comes from the same
 * section, rendered by the recommendations endpoint.
 */
import { parseHTML } from '@theme/utils';

class ProductRecommendations extends HTMLElement {
  connectedCallback() {
    if (this.children.length) return; // Already rendered (e.g. by the theme editor).
    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        this.observer.disconnect();
        this.load();
      },
      { rootMargin: '0px 0px 400px 0px' },
    );
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }

  async load() {
    const url = new URL(this.dataset.url, window.location.origin);
    url.searchParams.set('product_id', this.dataset.productId);
    url.searchParams.set('section_id', this.dataset.sectionId);
    url.searchParams.set('limit', this.dataset.limit);
    url.searchParams.set('intent', this.dataset.intent);

    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const fresh = parseHTML(await response.text()).querySelector('product-recommendations');
      if (fresh?.children.length)
        this.replaceChildren(...[...fresh.children].map((node) => document.importNode(node, true)));
    } catch {
      // Recommendations are optional: the page works without them.
    }
  }
}

if (!customElements.get('product-recommendations')) {
  customElements.define('product-recommendations', ProductRecommendations);
}
