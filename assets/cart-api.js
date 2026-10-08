/**
 * Ajax Cart API with bundled section rendering, imported as `@theme/cart-api`.
 *
 * Every call asks Shopify to render the cart sections in the same response
 * (`sections` + `sections_url`), so the drawer, the cart page and the header
 * count come back as server-rendered HTML in one round trip: prices,
 * discounts and translations are never recomputed in JavaScript.
 */
import { EVENTS, dispatch, getConfig } from '@theme/utils';

export class CartError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CartError';
    this.status = status;
  }
}

/**
 * Cart requests run one after another. Two quick quantity changes would
 * otherwise race, and an older response could overwrite a newer cart.
 */
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/** Sections the current page shows for the cart: the drawer and/or the cart page section. */
function cartSectionIds() {
  return [...document.querySelectorAll('[data-cart-section]')].map((element) => element.dataset.cartSection);
}

async function postToCart(url, body, sections) {
  const isForm = body instanceof FormData;
  if (sections.length) {
    if (isForm) {
      body.set('sections', sections.join(','));
      body.set('sections_url', window.location.pathname);
    } else {
      body.sections = sections;
      body.sections_url = window.location.pathname;
    }
  }

  const response = await fetch(`${url}.js`, {
    method: 'POST',
    headers: isForm
      ? { Accept: 'application/json' }
      : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // 422 carries a shopper-facing reason, e.g. "Only 2 left in stock."
    throw new CartError(data.description || data.message || getConfig().strings?.cartError, response.status);
  }
  return data;
}

function notify(data, source) {
  dispatch(EVENTS.cartUpdated, { sections: data.sections || {}, itemCount: data.item_count, source });
}

/** Adds the variant in a product form (`id`, `quantity`, line item properties, selling plan). */
export function addToCart(formData) {
  return enqueue(async () => {
    const data = await postToCart(getConfig().routes.cartAdd, formData, cartSectionIds());
    notify(data, 'add');
    return data;
  });
}

/** Sets a line's quantity; 0 removes it. `line` is the line item key. */
export function changeLine(line, quantity) {
  return enqueue(async () => {
    const data = await postToCart(getConfig().routes.cartChange, { id: line, quantity }, cartSectionIds());
    notify(data, 'change');
    return data;
  });
}

export function updateNote(note) {
  return enqueue(() => postToCart(getConfig().routes.cartUpdate, { note }, []));
}
