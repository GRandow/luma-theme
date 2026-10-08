/**
 * <announcement-bar>: rotates between messages and enforces their schedule in
 * the browser. Liquid already left out messages that are off-schedule when
 * the page was rendered, but a cached page can outlive a start or end date, so
 * the dates are checked again here against the store's UTC offset.
 */
class AnnouncementBar extends HTMLElement {
  connectedCallback() {
    this.removeOffSchedule();
    this.messages = [...this.querySelectorAll('.announcement-bar__message')];
    this.index = Math.max(
      0,
      this.messages.findIndex((message) => message.classList.contains('is-active')),
    );
    if (this.messages.length && !this.messages[this.index].classList.contains('is-active')) {
      this.show(0);
    }
    if (this.messages.length < 2) return;

    this.querySelectorAll('[data-step]').forEach((button) => {
      button.hidden = false;
      button.addEventListener('click', () => {
        this.show(this.index + Number(button.dataset.step));
        this.stop();
      });
    });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.dataset.autoplay && !reducedMotion && !window.Shopify?.designMode) {
      this.addEventListener('mouseenter', () => this.stop());
      this.addEventListener('focusin', () => this.stop());
      this.addEventListener('mouseleave', () => this.start());
      this.start();
    }
  }

  disconnectedCallback() {
    this.stop();
  }

  /** Store-local midnight of an ISO date ("2026-11-27"), as a timestamp. */
  storeMidnight(isoDate) {
    const time = Date.parse(`${isoDate}T00:00:00${this.dataset.utcOffset || 'Z'}`);
    return Number.isNaN(time) ? null : time;
  }

  removeOffSchedule() {
    if (window.Shopify?.designMode) return;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    this.querySelectorAll('.announcement-bar__message').forEach((message) => {
      const starts = message.dataset.startsOn && this.storeMidnight(message.dataset.startsOn);
      const ends = message.dataset.endsOn && this.storeMidnight(message.dataset.endsOn);
      if ((starts && now < starts) || (ends && now >= ends + day)) message.remove();
    });
    if (!this.querySelector('.announcement-bar__message')) this.hidden = true;
  }

  show(index) {
    const count = this.messages.length;
    this.index = (index + count) % count;
    this.messages.forEach((message, position) => {
      const active = position === this.index;
      message.classList.toggle('is-active', active);
      message.toggleAttribute('inert', !active);
    });
  }

  start() {
    this.stop();
    this.timer = setInterval(() => this.show(this.index + 1), Number(this.dataset.autoplay));
  }

  stop() {
    clearInterval(this.timer);
  }
}

if (!customElements.get('announcement-bar')) customElements.define('announcement-bar', AnnouncementBar);
