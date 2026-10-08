/**
 * Shared helpers, imported as `@theme/utils` through the import map in
 * layout/theme.liquid (the map points to the versioned asset URL, so every
 * module shares one cached copy).
 */

/** Custom events the components use to talk to each other. */
export const EVENTS = Object.freeze({
  cartUpdated: 'cart:updated',
  cartOpen: 'cart:open',
  variantChange: 'variant:change',
});

let config;

/**
 * Routes, settings and strings rendered by Liquid into #theme-config. Reading
 * routes from Liquid keeps every request locale- and market-aware
 * (`/pt-BR/cart/add` instead of a hardcoded `/cart/add`).
 */
export function getConfig() {
  config ??= JSON.parse(document.getElementById('theme-config')?.textContent || '{}');
  return config;
}

export function debounce(callback, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
}

export function dispatch(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Parses a server-rendered HTML string (a section, a cart drawer) into a document. */
export function parseHTML(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * Section Rendering API: asks Shopify for one section of a page, rendered with
 * the page's own URL parameters (filters, variant, search terms...).
 *
 * @param {string} url - Page URL, absolute or relative, with its query string
 * @param {string} sectionId - Section to render, e.g. `template--123__main`
 * @param {AbortSignal} [signal]
 * @returns {Promise<Document>}
 */
export async function fetchSection(url, sectionId, signal) {
  const target = new URL(url, window.location.origin);
  target.searchParams.set('section_id', sectionId);
  const response = await fetch(target, { signal, headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`Section ${sectionId} responded with ${response.status}`);
  return parseHTML(await response.text());
}

/**
 * The polite live region to speak through. While a modal <dialog> is open the
 * rest of the page is inert, so a region outside it would stay silent: the
 * open dialog gets its own.
 */
function liveRegion() {
  const dialog = [...document.querySelectorAll('dialog[open]')].pop();
  if (!dialog) return document.getElementById('LiveRegion');
  let region = dialog.querySelector(':scope > [data-live-region]');
  if (!region) {
    region = document.createElement('p');
    region.className = 'visually-hidden';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.dataset.liveRegion = '';
    dialog.append(region);
  }
  return region;
}

/** Screen reader announcement through a polite live region. */
export function announce(message) {
  const region = liveRegion();
  if (!region || !message) return;
  region.textContent = '';
  // Setting the text on the next frame makes repeated messages announce again.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/**
 * Opens a native modal <dialog>. Triggers that declare `aria-haspopup` get
 * `aria-expanded` kept in sync; focus returns to the trigger on close, or to
 * another trigger of the same dialog if that one was re-rendered meanwhile.
 */
export function openDialog(dialog, opener) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  const expands = opener?.hasAttribute('aria-haspopup');
  if (expands) opener.setAttribute('aria-expanded', 'true');
  dialog.addEventListener(
    'close',
    () => {
      if (expands) opener.setAttribute('aria-expanded', 'false');
      const target = opener?.isConnected ? opener : document.querySelector(`[data-dialog-open="${dialog.id}"]`);
      target?.focus({ preventScroll: true });
    },
    { once: true },
  );
}

/** True for AbortController cancellations, which are expected and silent. */
export function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError';
}
