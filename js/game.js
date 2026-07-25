(() => {
  "use strict";

  const titleScreen = document.getElementById("title-screen");
  const gameScreen = document.getElementById("game-screen");
  const overScreen = document.getElementById("over-screen");
  const btnStart = document.getElementById("btn-start");
  const btnAgain = document.getElementById("btn-again");
  const btnMenu = document.getElementById("btn-menu");
  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const finalScoreEl = document.getElementById("final-score");
  const hintEl = document.getElementById("control-hint");
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const state = {
    running: false,
    width: 0,
    height: 0,
    dpr: 1,
    score: 0,
    lives: 3,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    clouds: [],
    keys: Object.create(null),
    pointerActive: false,
    pointerX: 0,
    shootCooldown: 0,
    spawnTimer: 0,
    invuln: 0,
    raf: 0,
    lastTs: 0,
    hintTimer: 0,
  };

  function showScreen(screen) {
    [titleScreen, gameScreen, overScreen].forEach((el) => {
      const active = el === screen;
      el.classList.toggle("is-active", active);
      if (active) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
  }

  function resize() {
    const rect = gameScreen.getBoundingClientRect();
    state.width = Math.max(1, Math.floor(rect.width));
    state.height = Math.max(1, Math.floor(rect.height));
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    if (state.player) {
      state.player.x = clamp(state.player.x, 28, state.width - 28);
      state.player.y = clamp(state.player.y, state.height * 0.55, state.height - 40);
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function createClouds() {
    state.clouds = Array.from({ length: 6 }, () => ({
      x: rand(0, state.width),
      y: rand(40, state.height * 0.7),
      w: rand(60, 140),
      speed: rand(12, 36),
      alpha: rand(0.2, 0.45),
    }));
  }

  function resetGame() {
    state.score = 0;
    state.lives = 3;
    state.bullets = [];
    state.enemies = [];
    state.particles = [];
    state.shootCooldown = 0;
    state.spawnTimer = 0.6;
    state.invuln = 1.2;
    state.lastTs = 0;
    state.hintTimer = 4;
    hintEl.classList.remove("is-faded");
    scoreEl.textContent = "0";
    livesEl.textContent = "3";
    state.player = {
      x: state.width / 2,
      y: state.height - 72,
      w: 46,
      h: 34,
      speed: 320,
    };
    createClouds();
  }

  function startGame() {
    showScreen(gameScreen);
    resize();
    resetGame();
    state.running = true;
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(loop);
  }

  function endGame() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    finalScoreEl.textContent = String(state.score);
    showScreen(overScreen);
  }

  function backToMenu() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    showScreen(titleScreen);
  }

  function spawnEnemy() {
    const size = rand(28, 44);
    state.enemies.push({
      x: rand(size, state.width - size),
      y: -size,
      w: size,
      h: size * 0.7,
      speed: rand(70, 140) + state.score * 0.8,
      sway: rand(0, Math.PI * 2),
      swaySpeed: rand(1.2, 2.4),
      hp: 1,
    });
  }

  function burst(x, y, color, count = 10) {
    for (let i = 0; i < count; i += 1) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(40, 180);
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: rand(0.3, 0.7),
        max: 0.7,
        color,
        size: rand(2, 5),
      });
    }
  }

  function hitTest(a, b) {
    return (
      Math.abs(a.x - b.x) < (a.w + b.w) * 0.42 &&
      Math.abs(a.y - b.y) < (a.h + b.h) * 0.42
    );
  }

  function update(dt) {
    const p = state.player;
    let mx = 0;
    let my = 0;

    if (state.keys.ArrowLeft || state.keys.a || state.keys.A) mx -= 1;
    if (state.keys.ArrowRight || state.keys.d || state.keys.D) mx += 1;
    if (state.keys.ArrowUp || state.keys.w || state.keys.W) my -= 1;
    if (state.keys.ArrowDown || state.keys.s || state.keys.S) my += 1;

    if (state.pointerActive) {
      const dx = state.pointerX - p.x;
      mx = clamp(dx / 40, -1, 1);
      // 指標操作時維持高度帶，略微跟隨垂直可選：略微上移手感
      my = 0;
    }

    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my) || 1;
      p.x += (mx / len) * p.speed * dt;
      p.y += (my / len) * p.speed * dt;
    }

    p.x = clamp(p.x, 28, state.width - 28);
    p.y = clamp(p.y, state.height * 0.52, state.height - 36);

    state.shootCooldown -= dt;
    if (state.shootCooldown <= 0) {
      state.bullets.push({
        x: p.x,
        y: p.y - 22,
        w: 4,
        h: 12,
        speed: 520,
      });
      state.shootCooldown = 0.18;
    }

    state.bullets = state.bullets.filter((b) => {
      b.y -= b.speed * dt;
      return b.y > -20;
    });

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      const pace = Math.max(0.35, 1.1 - state.score * 0.01);
      state.spawnTimer = pace;
    }

    state.enemies.forEach((e) => {
      e.sway += e.swaySpeed * dt;
      e.y += e.speed * dt;
      e.x += Math.sin(e.sway) * 40 * dt;
      e.x = clamp(e.x, e.w * 0.5, state.width - e.w * 0.5);
    });

    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      let dead = false;

      for (let j = state.bullets.length - 1; j >= 0; j -= 1) {
        const b = state.bullets[j];
        if (hitTest(e, b)) {
          state.bullets.splice(j, 1);
          dead = true;
          state.score += 10;
          scoreEl.textContent = String(state.score);
          burst(e.x, e.y, "#ffb36b", 12);
          break;
        }
      }

      if (!dead && e.y > state.height + 40) {
        dead = true;
      }

      if (!dead && state.invuln <= 0 && hitTest(e, p)) {
        dead = true;
        state.lives -= 1;
        livesEl.textContent = String(state.lives);
        state.invuln = 1.5;
        burst(p.x, p.y, "#7ec8ff", 16);
        if (state.lives <= 0) {
          endGame();
          return;
        }
      }

      if (dead) state.enemies.splice(i, 1);
    }

    state.particles = state.particles.filter((pt) => {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.98;
      pt.vy *= 0.98;
      return pt.life > 0;
    });

    state.clouds.forEach((c) => {
      c.x += c.speed * dt;
      if (c.x - c.w > state.width) {
        c.x = -c.w;
        c.y = rand(40, state.height * 0.7);
      }
    });

    if (state.invuln > 0) state.invuln -= dt;

    if (state.hintTimer > 0) {
      state.hintTimer -= dt;
      if (state.hintTimer <= 0) hintEl.classList.add("is-faded");
    }
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, state.height);
    g.addColorStop(0, "#08284f");
    g.addColorStop(0.45, "#1a6bb5");
    g.addColorStop(1, "#8ec8f2");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.width, state.height);

    // 太陽
    const sunX = state.width * 0.82;
    const sunY = state.height * 0.14;
    const sunR = Math.min(state.width, state.height) * 0.07;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.2);
    sunGrad.addColorStop(0, "rgba(255, 240, 190, 0.95)");
    sunGrad.addColorStop(0.4, "rgba(255, 210, 120, 0.55)");
    sunGrad.addColorStop(1, "rgba(255, 210, 120, 0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    state.clouds.forEach((c) => {
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = "#ffffff";
      roundCloud(c.x, c.y, c.w);
    });
    ctx.globalAlpha = 1;
  }

  function roundCloud(x, y, w) {
    const h = w * 0.35;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.5, h * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(x - w * 0.25, y + 4, w * 0.28, h * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.28, y + 2, w * 0.3, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer() {
    const p = state.player;
    const blink = state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(p.x, p.y);

    // 尾焰
    ctx.fillStyle = "rgba(255, 180, 80, 0.85)";
    ctx.beginPath();
    ctx.moveTo(-6, 16);
    ctx.lineTo(0, 28 + Math.sin(performance.now() / 50) * 4);
    ctx.lineTo(6, 16);
    ctx.fill();

    // 機翼
    ctx.fillStyle = "#d7e2ee";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-28, 14);
    ctx.lineTo(-8, 12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(28, 14);
    ctx.lineTo(8, 12);
    ctx.closePath();
    ctx.fill();

    // 機身
    const body = ctx.createLinearGradient(0, -18, 0, 18);
    body.addColorStop(0, "#f7fbff");
    body.addColorStop(1, "#8fa3b8");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.quadraticCurveTo(12, -4, 8, 16);
    ctx.lineTo(-8, 16);
    ctx.quadraticCurveTo(-12, -4, 0, -20);
    ctx.fill();

    // 座艙
    ctx.fillStyle = "#3f8fd4";
    ctx.beginPath();
    ctx.ellipse(0, -6, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鼻錐
    ctx.fillStyle = "#d6452d";
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(4, -12);
    ctx.lineTo(-4, -12);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    ctx.fillStyle = "#3a4454";
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(18, -6);
    ctx.lineTo(6, -2);
    ctx.lineTo(0, -16);
    ctx.lineTo(-6, -2);
    ctx.lineTo(-18, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#c23b2a";
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6ec0ff";
    ctx.beginPath();
    ctx.ellipse(0, -2, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawBullets() {
    ctx.fillStyle = "#ffe08a";
    state.bullets.forEach((b) => {
      ctx.beginPath();
      ctx.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 2);
      ctx.fill();
    });
  }

  function drawParticles() {
    state.particles.forEach((pt) => {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawBackground();
    drawBullets();
    state.enemies.forEach(drawEnemy);
    drawPlayer();
    drawParticles();
  }

  function loop(ts) {
    if (!state.running) return;
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.033, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    update(dt);
    if (!state.running) return;
    draw();
    state.raf = requestAnimationFrame(loop);
  }

  function pointerPos(event) {
    const rect = canvas.getBoundingClientRect();
    const src = event.touches ? event.touches[0] : event;
    if (!src) return null;
    return {
      x: src.clientX - rect.left,
      y: src.clientY - rect.top,
    };
  }

  function onPointerDown(event) {
    if (!state.running) return;
    const pos = pointerPos(event);
    if (!pos) return;
    state.pointerActive = true;
    state.pointerX = pos.x;
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!state.running || !state.pointerActive) return;
    const pos = pointerPos(event);
    if (!pos) return;
    state.pointerX = pos.x;
    // 觸控時也允許微調高度
    state.player.y = clamp(pos.y, state.height * 0.52, state.height - 36);
    event.preventDefault();
  }

  function onPointerUp() {
    state.pointerActive = false;
  }

  btnStart.addEventListener("click", startGame);
  btnAgain.addEventListener("click", startGame);
  btnMenu.addEventListener("click", backToMenu);

  window.addEventListener("resize", () => {
    if (gameScreen.classList.contains("is-active")) resize();
  });
  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      if (gameScreen.classList.contains("is-active")) resize();
    }, 120);
  });

  window.addEventListener("keydown", (e) => {
    state.keys[e.key] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    state.keys[e.key] = false;
  });

  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  canvas.addEventListener("touchend", onPointerUp);
  canvas.addEventListener("touchcancel", onPointerUp);

  // roundRect polyfill for older mobile browsers
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const radius = typeof r === "number" ? r : 0;
      this.moveTo(x + radius, y);
      this.arcTo(x + w, y, x + w, y + h, radius);
      this.arcTo(x + w, y + h, x, y + h, radius);
      this.arcTo(x, y + h, x, y, radius);
      this.arcTo(x, y, x + w, y, radius);
      this.closePath();
      return this;
    };
  }

  showScreen(titleScreen);
})();
