import { beforeEach } from 'vitest';

// jsdom does not implement layout observers or element scrolling. Real viewport
// anchoring is verified in Chromium; component tests still exercise the runtime.
// Install after each test module has had a chance to supply its own layout-aware
// observer (chart geometry suites do so at module scope).
beforeEach(() => {
  if (typeof window === 'undefined') return;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = function (options: ScrollToOptions | number = {}, y?: number) {
      this.scrollTop = typeof options === 'number' ? y ?? 0 : options.top ?? this.scrollTop;
      this.scrollLeft = typeof options === 'number' ? options : options.left ?? this.scrollLeft;
    };
  }
});
