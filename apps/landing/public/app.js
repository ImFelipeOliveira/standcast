(() => {
  const reduceQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  const reduced = () => Boolean(reduceQuery?.matches);

  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };

  const selectText = (element) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const status = document.getElementById('copy-status');
  const announce = (text) => {
    if (status) status.textContent = text;
  };

  if (navigator.clipboard?.writeText) {
    for (const button of document.querySelectorAll('button.copy[data-target]')) {
      const source = document.getElementById(button.dataset.target ?? '');
      if (!source) continue;
      const label = button.textContent;
      const done = button.dataset.done || label;
      let timer = 0;
      button.hidden = false;
      button.addEventListener('click', () => {
        const text = source.dataset.copy || source.textContent || '';
        navigator.clipboard.writeText(text).then(
          () => {
            button.textContent = done;
            announce(done);
            clearTimeout(timer);
            timer = window.setTimeout(() => {
              button.textContent = label;
              announce('');
            }, 1600);
          },
          () => selectText(source),
        );
      });
    }
  }

  const header = document.querySelector('header.nav');
  if (header) {
    let queued = false;
    const update = () => {
      queued = false;
      header.classList.toggle('nav-compact', window.scrollY > 32);
    };
    window.addEventListener(
      'scroll',
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
      },
      { passive: true },
    );
    update();
  }

  for (const list of document.querySelectorAll('[role="tablist"]')) {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((tab) =>
      document.getElementById(tab.getAttribute('aria-controls') ?? ''),
    );
    if (tabs.length === 0 || panels.some((panel) => !panel)) continue;
    const select = (index, focus) => {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (focus) tabs[index].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i, false));
      tab.addEventListener('keydown', (event) => {
        const moves = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(event.key in moves)) return;
        event.preventDefault();
        select((moves[event.key] + tabs.length) % tabs.length, true);
      });
    });
    list.hidden = false;
    list.parentElement?.classList.add('tabbed');
    select(0, false);
  }

  const stage = document.querySelector('.stage');
  if (stage && !reduced()) stage.classList.add('play');

  const startField = (canvas, context, toggle) => {
    const CELL = 10;
    const FRAME = 1000 / 30;
    const KEY = 'standcast:field-paused';
    let cells = [];
    let width = 0;
    let cols = 0;
    let rows = 0;
    let ratio = 1;
    let mark = '#3b4bc8';
    let base = null;
    let visible = !('IntersectionObserver' in window);
    let paused = storage.get(KEY) === '1';
    let still = reduced();
    let frame = 0;
    let last = 0;
    let clock = 0;

    const limit = (col) => {
      if (width < 960) return 0.1;
      const x = col / cols;
      return x < 0.5 ? 0.1 : 0.1 + 0.22 * Math.min(1, (x - 0.5) / 0.2);
    };

    const spawn = (at) => {
      if (!cols || !rows || cells.length > 260) return;
      let col = 0;
      for (let tries = 0; tries < 6; tries++) {
        col = Math.floor(Math.random() * cols);
        if (Math.random() < 0.18 + 0.82 * (col / cols) ** 1.6) break;
      }
      const row = Math.floor(Math.random() * rows);
      const length = 1 + Math.floor(Math.random() * 4);
      const duration = 3200 + Math.random() * 1200;
      for (let i = 0; i < length; i++) {
        cells.push({ col, row: row - i, start: at + i * 160, duration });
      }
    };

    const paintBase = () => {
      const styles = getComputedStyle(canvas);
      mark = styles.getPropertyValue('--mark').trim() || mark;
      const dot = styles.getPropertyValue('--dot').trim() || 'rgba(24, 24, 27, 0.08)';
      base = document.createElement('canvas');
      base.width = canvas.width;
      base.height = canvas.height;
      const ink = base.getContext('2d');
      if (!ink) return;
      ink.setTransform(ratio, 0, 0, ratio, 0, 0);
      ink.fillStyle = dot;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) ink.fillRect(x * CELL + 3, y * CELL + 3, 4, 4);
      }
    };

    const draw = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (base) context.drawImage(base, 0, 0);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = mark;
      const alive = [];
      for (const cell of cells) {
        const x = (clock - cell.start) / cell.duration;
        if (x >= 1) continue;
        alive.push(cell);
        if (x <= 0 || cell.row < 0) continue;
        context.globalAlpha = limit(cell.col) * Math.sin(Math.PI * x);
        context.fillRect(cell.col * CELL + 1, cell.row * CELL + 1, 8, 8);
      }
      context.globalAlpha = 1;
      cells = alive;
    };

    const resize = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      cols = Math.ceil(width / CELL);
      rows = Math.ceil(canvas.clientHeight / CELL);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      paintBase();
      draw();
    };

    const running = () => !still && !paused && visible && !document.hidden;

    const tick = (now) => {
      frame = 0;
      if (!last || now - last >= FRAME - 1) {
        clock += last ? Math.min(now - last, 100) : FRAME;
        last = now;
        if (Math.random() < 0.55) spawn(clock);
        draw();
      }
      schedule();
    };

    const schedule = () => {
      if (running()) {
        if (!frame) frame = requestAnimationFrame(tick);
        return;
      }
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };

    const sync = () => {
      if (!toggle) return;
      toggle.hidden = still;
      toggle.setAttribute('aria-pressed', String(paused));
    };

    toggle?.addEventListener('click', () => {
      paused = !paused;
      storage.set(KEY, paused ? '1' : '0');
      sync();
      schedule();
    });

    reduceQuery?.addEventListener?.('change', () => {
      still = reduced();
      sync();
      schedule();
    });

    darkQuery?.addEventListener?.('change', () => {
      paintBase();
      draw();
    });

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        schedule();
      }).observe(canvas);
    }

    document.addEventListener('visibilitychange', schedule);

    resize();
    for (let i = 0; i < (still ? 70 : 40); i++) spawn(clock - Math.random() * 3000);
    draw();
    sync();
    schedule();
  };

  const canvas = document.querySelector('canvas.field');
  const context = canvas?.getContext('2d');
  if (canvas && context) startField(canvas, context, document.querySelector('button.field-toggle'));
})();
