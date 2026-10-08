/**
 * <facet-filters>: filters, sorting and pagination without full page loads.
 *
 * The filters form stays a normal GET form. Here every change is turned into
 * the same URL the form would submit, the section is fetched for that URL
 * through the Section Rendering API, and only the regions marked
 * `data-facets-update` are swapped (results, product count…). Filter groups
 * keep their open/closed state; only their values are refreshed. The URL is
 * pushed to history, so filtered pages can be shared and the back button
 * restores the previous filters.
 */
import { announce, debounce, fetchSection, isAbortError } from '@theme/utils';

class FacetFilters extends HTMLElement {
  connectedCallback() {
    this.addEventListener('change', this.onChange);
    this.addEventListener('input', this.onPriceInput);
    this.addEventListener('submit', this.onSubmit);
    this.addEventListener('click', this.onLinkClick);
    window.addEventListener('popstate', this.onPopState);
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.onPopState);
    this.controller?.abort();
  }

  get form() {
    return this.querySelector('[data-facets-form]') || document.querySelector(`#FacetsForm-${this.dataset.sectionId}`);
  }

  /** The URL the form would submit to, without empty fields such as untouched price inputs. */
  urlFromForm() {
    const form = this.form;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (value !== '') params.append(name, value);
    }
    const url = new URL(form.action, window.location.origin);
    url.search = params.toString();
    return url;
  }

  onChange = (event) => {
    if (event.target.matches('[data-price-input]')) return; // handled while typing
    if (!event.target.form?.matches('[data-facets-form]')) return;
    this.render(this.urlFromForm());
  };

  onPriceInput = debounce((event) => {
    if (event.target.matches('[data-price-input]') && event.target.checkValidity()) {
      this.render(this.urlFromForm());
    }
  }, 600);

  onSubmit = (event) => {
    if (!event.target.matches('[data-facets-form]')) return;
    event.preventDefault();
    this.render(this.urlFromForm());
  };

  onLinkClick = (event) => {
    const link = event.target.closest('a[data-facet-link]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const isPagination = Boolean(link.closest('.pagination'));
    this.render(new URL(link.href), { scroll: isPagination });
  };

  onPopState = () => {
    this.render(new URL(window.location.href), { push: false });
  };

  async render(url, { push = true, scroll = false } = {}) {
    this.controller?.abort();
    this.controller = new AbortController();
    const results = this.querySelector('[data-facets-update="results"]');
    results?.setAttribute('aria-busy', 'true');

    try {
      const html = await fetchSection(url, this.dataset.sectionId, this.controller.signal);
      const fresh = html.querySelector('facet-filters');
      if (!fresh) throw new Error('The section came back without filters.');

      const focusedId = document.activeElement?.id;
      this.swapRegions(fresh);
      // Back/Forward: every control must match the restored URL, so nothing is kept.
      this.refreshFilterValues(fresh, { keepTyping: push });
      this.restoreFocus(focusedId);

      if (push) window.history.pushState({ facets: true }, '', `${url.pathname}${url.search}`);
      announce(this.querySelector('[data-facets-update="count"]')?.textContent.trim());
      if (scroll) this.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (!isAbortError(error)) window.location.assign(url);
    } finally {
      results?.removeAttribute('aria-busy');
    }
  }

  swapRegions(fresh) {
    this.querySelectorAll('[data-facets-update]').forEach((region) => {
      const key = CSS.escape(region.dataset.facetsUpdate);
      const replacement = fresh.querySelector(`[data-facets-update="${key}"]`);
      if (replacement) region.replaceWith(document.importNode(replacement, true));
    });
  }

  /**
   * Counts, disabled and checked states change with every filter. The
   * <details> around each group keeps its open state; only its values and the
   * active-count badge in its summary are refreshed. A price field the shopper
   * is typing in is left alone.
   */
  refreshFilterValues(fresh, { keepTyping }) {
    const typing = keepTyping && document.activeElement?.matches('[data-price-input]');

    // Groups that appeared or disappeared (filters with no values) need the full form.
    const keys = (root) =>
      [...root.querySelectorAll('[data-filter-key]')].map((group) => group.dataset.filterKey).join();
    if (keys(this) !== keys(fresh)) {
      const form = this.querySelector('[data-facets-form]');
      const freshForm = fresh.querySelector('[data-facets-form]');
      if (form && freshForm) form.replaceWith(document.importNode(freshForm, true));
      return;
    }

    this.querySelectorAll('[data-filter-values]').forEach((values) => {
      const key = CSS.escape(values.dataset.filterValues);
      const replacement = fresh.querySelector(`[data-filter-values="${key}"]`);
      if (!replacement || (typing && values.contains(document.activeElement))) return;
      values.replaceWith(document.importNode(replacement, true));
    });

    this.querySelectorAll('[data-filter-summary]').forEach((summary) => {
      const key = CSS.escape(summary.dataset.filterSummary);
      const replacement = fresh.querySelector(`[data-filter-summary="${key}"]`);
      if (replacement) summary.innerHTML = replacement.innerHTML;
    });
  }

  /**
   * Puts focus back on the control the shopper used. Links in the results
   * (filter chips, "Clear all", pages) are replaced, so focus moves to the
   * product count, which also reads out the new number of results.
   */
  restoreFocus(focusedId) {
    if (document.activeElement && document.activeElement !== document.body) return;
    const target =
      (focusedId && document.getElementById(focusedId)) || this.querySelector('[data-facets-update="count"]');
    target?.focus({ preventScroll: true });
  }
}

if (!customElements.get('facet-filters')) customElements.define('facet-filters', FacetFilters);
