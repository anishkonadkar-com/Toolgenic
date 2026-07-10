(() => {
  'use strict';

  /**
   * ToolGenic front-end interactions. Selectors support common naming variants
   * so optional sections can be added without breaking the UI.
   */
  const SELECTORS = {
    header: '[data-header], .site-header, header',
    themeToggle: '[data-theme-toggle], .theme-toggle, #theme-toggle',
    navToggle: '[data-menu-toggle], .menu-toggle, .hamburger, #menu-toggle',
    nav: '[data-mobile-nav], .mobile-nav, .nav-links, nav',
    search: '[data-tool-search], #tool-search, #search-input, .tool-search input[type="search"]',
    cards: '[data-tool-card], .tool-card',
    faqItems: '[data-faq-item], .faq-item',
    faqTriggers: '[data-faq-trigger], .faq-question, .faq-button, button[aria-controls]',
    animate: '[data-animate], .animate-on-scroll, .fade-up'
  };

  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const storageKey = 'toolgenic-theme';

  const focusable =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const query = (selector, scope = doc) => scope.querySelector(selector);
  const queryAll = (selector, scope = doc) => [...scope.querySelectorAll(selector)];

  const debounce = (callback, wait = 120) => {
    let timer;

    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback(...args), wait);
    };
  };

  const getStoredTheme = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch (_) {
      return null;
    }
  };

  const saveTheme = (theme) => {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (_) {
      // Storage may be unavailable in restricted browsing environments.
    }
  };

  const getTheme = () => {
    const saved = getStoredTheme();

    if (saved === 'light' || saved === 'dark') {
      return saved;
    }

    return prefersDark.matches ? 'dark' : 'light';
  };

  const updateThemeControls = (theme) => {
    queryAll(SELECTORS.themeToggle).forEach((button) => {
      const isDark = theme === 'dark';

      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute(
        'aria-label',
        isDark ? 'Switch to light mode' : 'Switch to dark mode'
      );

      button.dataset.theme = theme;

      const icon = query('[data-theme-icon], .theme-icon, i, svg', button);

      if (icon) {
        icon.setAttribute('aria-hidden', 'true');
        icon.dataset.icon = isDark ? 'sun' : 'moon';
        icon.classList.toggle('is-sun', isDark);
        icon.classList.toggle('is-moon', !isDark);
      }

      const label = query('[data-theme-label]', button);

      if (label) {
        label.textContent = isDark ? 'Light mode' : 'Dark mode';
      }
    });
  };

  const applyTheme = (theme, persist = false) => {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');

    updateThemeControls(theme);

    if (persist) {
      saveTheme(theme);
    }
  };

  const initTheme = () => {
    applyTheme(getTheme());

    queryAll(SELECTORS.themeToggle).forEach((button) => {
      button.addEventListener('click', () => {
        const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme, true);
      });
    });

    prefersDark.addEventListener?.('change', (event) => {
      if (!getStoredTheme()) {
        applyTheme(event.matches ? 'dark' : 'light');
      }
    });
  };

  const initNavigation = () => {
    const toggle = query(SELECTORS.navToggle);
    const nav = query(SELECTORS.nav);

    if (!toggle || !nav) {
      return;
    }

    let previousFocus = null;

    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.classList.toggle('is-active', open);
      toggle.setAttribute('aria-expanded', String(open));
      nav.setAttribute('aria-hidden', String(!open));
      body.classList.toggle('menu-open', open);
      body.style.overflow = open ? 'hidden' : '';

      if (open) {
        previousFocus = doc.activeElement;

        window.requestAnimationFrame(() => {
          query(focusable, nav)?.focus();
        });
      } else if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
        previousFocus = null;
      }
    };

    toggle.setAttribute('aria-expanded', 'false');

    if (!nav.id) {
      nav.id = 'mobile-navigation';
    }

    toggle.setAttribute('aria-controls', nav.id);

    toggle.addEventListener('click', () => {
      setOpen(!nav.classList.contains('is-open'));
    });

    doc.addEventListener('click', (event) => {
      const isOpen = nav.classList.contains('is-open');

      if (isOpen && !nav.contains(event.target) && !toggle.contains(event.target)) {
        setOpen(false);
      }
    });

    nav.addEventListener('click', (event) => {
      if (event.target.closest('a[href]')) {
        setOpen(false);
      }
    });

    doc.addEventListener('keydown', (event) => {
      if (!nav.classList.contains('is-open')) {
        return;
      }

      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const items = queryAll(focusable, nav).filter((item) => !item.hidden);

      if (!items.length) {
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      }

      if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  };

  const initSmoothScroll = () => {
    doc.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');

      if (!link || link.getAttribute('href') === '#') {
        return;
      }

      const target = query(link.getAttribute('href'));

      if (!target) {
        return;
      }

      event.preventDefault();

      const header = query(SELECTORS.header);
      const offset = header?.offsetHeight || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;

      window.scrollTo({
        top,
        behavior: prefersReducedMotion.matches ? 'auto' : 'smooth'
      });

      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }

      target.focus({ preventScroll: true });
      history.pushState(null, '', link.getAttribute('href'));
    });
  };

  const initStickyHeader = () => {
    const header = query(SELECTORS.header);

    if (!header) {
      return;
    }

    let previousY = window.scrollY;
    let ticking = false;

    const update = () => {
      const currentY = window.scrollY;

      header.classList.toggle('is-scrolled', currentY > 8);
      header.classList.toggle(
        'is-hidden',
        currentY > previousY && currentY > header.offsetHeight
      );

      previousY = currentY;
      ticking = false;
    };

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true }
    );

    update();
  };

  const initSearch = () => {
    const input = query(SELECTORS.search);
    const cards = queryAll(SELECTORS.cards);

    if (!input || !cards.length) {
      return;
    }

    let empty = query('[data-search-empty], .no-results');

    if (!empty) {
      empty = doc.createElement('p');
      empty.className = 'no-results';
      empty.dataset.searchEmpty = '';
      empty.textContent = 'No results found.';
      empty.hidden = true;
      empty.setAttribute('role', 'status');
      cards[0].parentElement?.append(empty);
    }

    const searchable = cards.map((card) => ({
      card,
      text: [
        card.dataset.title,
        card.dataset.description,
        card.dataset.keywords,
        card.textContent
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    }));

    const filter = () => {
      const term = input.value.trim().toLowerCase();
      let count = 0;

      searchable.forEach(({ card, text }) => {
        const visible = !term || text.includes(term);

        card.hidden = !visible;
        card.classList.toggle('is-filtered-out', !visible);

        if (visible) {
          count += 1;
        }
      });

      empty.hidden = count !== 0;
      input.setAttribute(
        'aria-describedby',
        empty.id || (empty.id = 'search-results-status')
      );
    };

    input.addEventListener('input', debounce(filter));
  };

  const initFaq = () => {
    const items = queryAll(SELECTORS.faqItems);

    if (!items.length) {
      return;
    }

    items.forEach((item, index) => {
      const trigger = query(SELECTORS.faqTriggers, item);

      if (!trigger) {
        return;
      }

      const panel =
        query('[data-faq-panel], .faq-answer, .faq-content', item) ||
        trigger.nextElementSibling;

      if (!panel) {
        return;
      }

      if (!panel.id) {
        panel.id = `faq-panel-${index + 1}`;
      }

      trigger.setAttribute('aria-controls', panel.id);

      const open =
        item.classList.contains('is-open') ||
        trigger.getAttribute('aria-expanded') === 'true';

      trigger.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;

      trigger.addEventListener('click', () => {
        const shouldOpen = trigger.getAttribute('aria-expanded') !== 'true';

        items.forEach((other) => {
          const otherTrigger = query(SELECTORS.faqTriggers, other);
          const otherPanel =
            query('[data-faq-panel], .faq-answer, .faq-content', other) ||
            otherTrigger?.nextElementSibling;

          if (otherTrigger && otherPanel) {
            other.classList.remove('is-open');
            otherTrigger.setAttribute('aria-expanded', 'false');
            otherPanel.hidden = true;
          }
        });

        item.classList.toggle('is-open', shouldOpen);
        trigger.setAttribute('aria-expanded', String(shouldOpen));
        panel.hidden = !shouldOpen;
      });
    });
  };

  const initScrollAnimations = () => {
    const elements = queryAll(SELECTORS.animate);

    if (!elements.length) {
      return;
    }

    if (prefersReducedMotion.matches || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, instance) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            instance.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -32px'
      }
    );

    elements.forEach((element) => observer.observe(element));
  };

  const initRipples = () => {
    doc.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ripple], .btn, button');

      if (!button || prefersReducedMotion.matches) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const ripple = doc.createElement('span');

      ripple.className = 'ripple';
      ripple.style.cssText = `left:${event.clientX - rect.left}px;top:${event.clientY - rect.top}px;`;
      ripple.setAttribute('aria-hidden', 'true');

      button.append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    });
  };

  const init = () => {
    initTheme();
    initNavigation();
    initSmoothScroll();
    initStickyHeader();
    initSearch();
    initFaq();
    initScrollAnimations();
    initRipples();
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
