(() => {
  const copy = document.getElementById('copy');
  const cmd = document.getElementById('cmd');
  if (copy && cmd) {
    const label = copy.textContent;
    const done = copy.dataset.done || label;
    const selectCmd = () => {
      const range = document.createRange();
      range.selectNodeContents(cmd);
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(range);
    };
    copy.addEventListener('click', () => {
      const text = cmd.dataset.copy || '';
      const confirm = () => {
        copy.textContent = done;
        setTimeout(() => {
          copy.textContent = label;
        }, 1600);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(confirm, selectCmd);
      } else {
        selectCmd();
      }
    });
  }

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const FRAGMENT = [
    'precision mediump float;',
    'uniform vec2 res;uniform float time;uniform float cell;uniform float strength;uniform float ratio;',
    'uniform float focus;uniform float spread;',
    'uniform vec3 ca;uniform vec3 cb;uniform vec3 cc;',
    'float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 q){vec2 i=floor(q);vec2 f=fract(q);vec2 u=f*f*(3.-2.*f);',
    'return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}',
    'float fbm(vec2 q){float v=0.;float a=.5;for(int k=0;k<4;k++){v+=a*n(q);q=q*2.02+vec2(1.7,9.2);a*=.5;}return v;}',
    'float blob(vec2 p,vec2 c,float r){vec2 d=(p-c)/r;return exp(-dot(d,d));}',
    'void main(){',
    'vec2 c=floor(gl_FragCoord.xy/cell);vec2 l=fract(gl_FragCoord.xy/cell)-.5;',
    'float t=time*.16;',
    'vec2 q=c/115.+vec2(t*.45,t*.15);',
    'vec2 w=vec2(fbm(q+vec2(t*.9,-t*.6)),fbm(q+vec2(5.2-t*.7,1.3+t*.8)));',
    'vec2 w2=vec2(fbm(q+3.*w+vec2(1.7,9.2)+t*.5),fbm(q+3.*w+vec2(8.3,2.8)-t*.4));',
    'float W=res.x/ratio;',
    'vec2 P=vec2(c.x*cell,res.y-c.y*cell)/ratio+(w2-.5)*220.;',
    'P.y=mod(P.y,820.);',
    'float b=blob(P,vec2(W*(focus+spread*.55*sin(t*1.1)),250.+120.*cos(t*.8)),300.);',
    'b+=blob(P,vec2(W*(focus+spread*.9*cos(t*.7+1.3)),560.+110.*sin(t*.9)),260.);',
    'b+=.8*blob(P,vec2(W*(focus-spread*.8*sin(t*.6+2.1)),120.+90.*sin(t*1.3)),230.);',
    'b+=.7*blob(P,vec2(W*(focus+spread*sin(t*.5+4.)),720.+80.*cos(t*.6)),240.);',
    'float v=fbm(q+3.4*w2)*.66+min(b,1.2)*.4;',
    'float g=smoothstep(.34,.94,v);',
    'vec3 col=mix(ca,cb,smoothstep(.3,.7,w2.x));col=mix(col,cc,smoothstep(.66,1.02,v)*.9);',
    'col*=.75+.7*g;',
    'float m=step(max(abs(l.x),abs(l.y)),.37);',
    'float a=m*(.03+.97*pow(g,1.35))*(.8+.4*h(c))*strength;',
    'gl_FragColor=vec4(min(col,vec3(1.))*a,min(a,1.));}',
  ].join('');
  const VERTEX = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  const rgb = (value) => {
    const hex = value.trim().replace('#', '');
    const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex;
    const num = Number.parseInt(full, 16) || 0;
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
  };

  const startField = (field) => {
    const gl = field.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    if (!gl) return;
    const shader = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const u = (name) => gl.getUniformLocation(program, name);
    const theme = () => {
      const css = getComputedStyle(field);
      gl.uniform3fv(u('ca'), rgb(css.getPropertyValue('--field-a')));
      gl.uniform3fv(u('cb'), rgb(css.getPropertyValue('--field-b')));
      gl.uniform3fv(u('cc'), rgb(css.getPropertyValue('--field-c')));
      gl.uniform1f(u('strength'), Number.parseFloat(css.getPropertyValue('--field-strength')) || 1);
      gl.uniform1f(u('focus'), Number.parseFloat(css.getPropertyValue('--field-focus')) || 0.5);
      gl.uniform1f(u('spread'), Number.parseFloat(css.getPropertyValue('--field-spread')) || 0.3);
    };
    const size = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      field.width = Math.max(1, Math.round(field.clientWidth * ratio));
      field.height = Math.max(1, Math.round(field.clientHeight * ratio));
      gl.viewport(0, 0, field.width, field.height);
      gl.uniform2f(u('res'), field.width, field.height);
      gl.uniform1f(u('cell'), 5 * ratio);
      gl.uniform1f(u('ratio'), ratio);
    };
    const start = performance.now() - 30000;
    const now = () => (reduce ? 30 : (performance.now() - start) / 1000);
    const draw = () => {
      gl.uniform1f(u('time'), now());
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    let visible = false;
    let frame = 0;
    const loop = () => {
      draw();
      frame = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const resume = () => {
      if (reduce) {
        draw();
        return;
      }
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };
    theme();
    size();
    draw();
    new ResizeObserver(() => {
      size();
      draw();
    }).observe(field);
    new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      resume();
    }).observe(field);
    document.addEventListener('visibilitychange', resume);
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
      theme();
      draw();
    });
  };
  for (const field of document.querySelectorAll('.hero-field')) startField(field);

  const header = document.querySelector('header.nav');
  if (header && document.querySelector('.field-stage')) {
    const clear = () => header.classList.toggle('nav-clear', window.scrollY < 24);
    clear();
    window.addEventListener('scroll', clear, { passive: true });
  }

  if (!reduce && 'IntersectionObserver' in window) {
    const root = document.documentElement;
    const days = [...document.querySelectorAll('.day')];
    const reveals = [
      ...document.querySelectorAll(
        'main section:not(.hero) .head, .features > *, .ways > *, .privacy-grid > .col, .beta',
      ),
    ].filter((element) => !element.closest('.day-grid'));
    for (const element of reveals) element.classList.add('reveal');
    root.classList.add('play-scroll');
    const shown = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in');
          shown.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    for (const element of reveals) shown.observe(element);
    let ticking = false;
    const track = () => {
      ticking = false;
      const anchor = window.innerHeight * 0.6;
      for (const day of days) {
        const box = day.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, (anchor - box.top) / box.height));
        day.style.setProperty('--progress', progress.toFixed(3));
        for (const slot of day.children) {
          slot.classList.toggle('in', slot.getBoundingClientRect().top + 12 < anchor);
        }
      }
    };
    const schedule = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(track);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    track();
  }

  const stage = document.querySelector('.stage');
  const replay = document.getElementById('replay');
  if (!stage || !replay || !window.matchMedia) return;
  if (reduce) return;
  let timer = 0;
  const play = () => {
    stage.classList.remove('play');
    void stage.offsetWidth;
    stage.classList.add('play');
    replay.hidden = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      replay.hidden = false;
    }, 5400);
  };
  replay.addEventListener('click', play);
  play();
})();
