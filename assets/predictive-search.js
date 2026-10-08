/**
 * <predictive-search>: search-as-you-type in the header search modal.
 *
 * Results come from Shopify's predictive search endpoint rendered through the
 * `predictive-search` section, so the markup, prices and translations are
 * Liquid's. The input is an ARIA combobox: arrow keys move through the
 * results, Enter opens the highlighted one, Escape clears.
 */
import { debounce, getConfig, isAbortError, parseHTML } from '@theme/utils';

const MIN_QUERY_LENGTH = 2;

class PredictiveSearch extends HTMLElement {
  connectedCallback() {
    this.input = this.querySelector('input[type="search"]');
    this.results = this.querySelector('[data-results]');
    this.status = this.querySelector('[data-status]');
    this.cache = new Map();

    this.input.addEventListener('input', this.onInput);
    this.input.addEventListener('keydown', this.onKeydown);
    this.closest('dialog')?.addEventListener('close', () => this.close());
  }

  onInput = debounce(() => {
    const query = this.input.value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      this.close();
      return;
    }
    this.search(query);
  }, 250);

  async search(query) {
    // A slower request for an earlier query must not overwrite these results.
    this.controller?.abort();
    if (this.cache.has(query)) {
      this.render(this.cache.get(query));
      return;
    }

    this.controller = new AbortController();
    const url = new URL(getConfig().routes.predictiveSearch, window.location.origin);
    url.searchParams.set('q', query);
    url.searchParams.set('resources[type]', 'product,collection,query,page,article');
    url.searchParams.set('resources[limit]', '4');
    url.searchParams.set('resources[limit_scope]', 'each');
    url.searchParams.set('section_id', 'predictive-search');

    this.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(url, { signal: this.controller.signal });
      if (!response.ok) throw new Error(`Predictive search responded with ${response.status}`);
      const markup = parseHTML(await response.text()).querySelector('[data-predictive-results]')?.innerHTML ?? '';
      this.cache.set(query, markup);
      this.render(markup);
    } catch (error) {
      if (!isAbortError(error)) this.close();
    } finally {
      this.removeAttribute('aria-busy');
    }
  }

  render(markup) {
    this.results.innerHTML = markup;
    this.results.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.input.removeAttribute('aria-activedescendant');
    const count = this.results.querySelector('[data-result-count]');
    this.status.textContent = count?.dataset.resultCount ?? '';
  }

  close() {
    this.controller?.abort();
    this.results.hidden = true;
    this.results.innerHTML = '';
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
    this.status.textContent = '';
  }

  get options() {
    return [...this.results.querySelectorAll('[role="option"]')];
  }

  onKeydown = (event) => {
    if (this.results.hidden) return;
    const options = this.options;
    const current = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!options.length) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.select(options, (current + step + options.length) % options.length);
        break;
      }
      case 'Enter':
        if (current >= 0) {
          event.preventDefault();
          options[current].click();
        }
        break;
      case 'Escape':
        if (this.input.value) {
          event.preventDefault();
          this.input.value = '';
          this.close();
        }
        break;
    }
  };

  select(options, index) {
    options.forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
    this.input.setAttribute('aria-activedescendant', options[index].id);
    options[index].scrollIntoView({ block: 'nearest' });
  }
}

if (!customElements.get('predictive-search')) customElements.define('predictive-search', PredictiveSearch);
