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
  const enemyCountEl = document.getElementById("enemy-count");
  const enemyGoalEl = document.getElementById("enemy-goal");
  const timeLeftEl = document.getElementById("time-left");
  const overTitleEl = document.getElementById("over-title");
  const overMessageEl = document.getElementById("over-message");
  const hintEl = document.getElementById("control-hint");
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  // 過關：200 架敵機中擊落 100 架，且須在 1 分鐘內完成
  const ENEMY_SPAWN_TOTAL = 200;
  const ENEMY_KILL_GOAL = 100;
  const STAGE_TIME = 60;
  const MEERKAT_COUNT = 12;
  const PUDDING_COUNT = 20;

  const state = {
    running: false,
    width: 0,
    height: 0,
    dpr: 1,
    score: 0,
    lives: 3,
    enemiesSpawned: 0,
    enemiesKilled: 0,
    timeLeft: STAGE_TIME,
    cleared: false,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    moneys: [],
    meerkats: [],
    puddingDogs: [],
    dunes: [],
    desertDuck: null,
    ultraman: null,
    keys: Object.create(null),
    pointerActive: false,
    pointerX: 0,
    shootCooldown: 0,
    spawnTimer: 0,
    invuln: 0,
    raf: 0,
    lastTs: 0,
    hintTimer: 0,
    sandOffset: 0,
  };

  function formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

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
      state.player.x = clamp(state.player.x, 44, state.width - 44);
      state.player.y = clamp(state.player.y, state.height * 0.5, state.height - 56);
    }

    if (state.running) {
      layoutDesertProps();
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function layoutDesertProps() {
    const groundY = state.height * 0.74;

    // 沙漠裡有一隻鴨鴨
    state.desertDuck = {
      x: state.width * 0.38,
      y: groundY + 18,
      scale: 1.15,
      bob: 0,
      facing: 1,
    };

    // 沙漠裡有奧特曼（置中偏右一點，左側布丁狗、右側霧濛）
    state.ultraman = {
      x: state.width * 0.52,
      y: groundY + 8,
      scale: Math.min(1.2, state.width / 340),
      bob: 0,
      armPhase: 0,
    };

    state.dunes = [
      { y: state.height * 0.55, amp: 28, color: "#c99555" },
      { y: state.height * 0.68, amp: 36, color: "#d9a86a" },
      { y: state.height * 0.82, amp: 44, color: "#e6b87a" },
    ];

    // 狐獴 12 隻，排在畫面右邊（站立的動物）
    const rightX = state.width * 0.82;
    state.meerkats = Array.from({ length: MEERKAT_COUNT }, (_, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      return {
        x: rightX + col * Math.min(34, state.width * 0.055),
        y: state.height * 0.18 + row * ((state.height * 0.7) / 4),
        scale: 0.95 + (i % 3) * 0.08,
        bob: rand(0, Math.PI * 2),
        bobSpeed: rand(1.2, 2.4),
      };
    });

    // 布丁狗 20 隻，排在畫面左邊
    const leftX = state.width * 0.06;
    state.puddingDogs = Array.from({ length: PUDDING_COUNT }, (_, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return {
        x: leftX + col * Math.min(36, state.width * 0.07),
        y: state.height * 0.12 + row * ((state.height * 0.78) / 10),
        scale: 0.7 + (i % 3) * 0.08,
        bob: rand(0, Math.PI * 2),
        bobSpeed: rand(1.5, 2.8),
      };
    });
  }

  function resetGame() {
    state.score = 0;
    state.lives = Infinity;
    state.enemiesSpawned = 0;
    state.enemiesKilled = 0;
    state.timeLeft = STAGE_TIME;
    state.cleared = false;
    state.bullets = [];
    state.enemies = [];
    state.particles = [];
    state.moneys = [];
    state.shootCooldown = 0;
    state.spawnTimer = 0.2;
    state.invuln = 1.2;
    state.lastTs = 0;
    state.hintTimer = 4.5;
    state.sandOffset = 0;
    hintEl.classList.remove("is-faded");
    scoreEl.textContent = "0";
    livesEl.textContent = "∞";
    enemyCountEl.textContent = "0";
    enemyGoalEl.textContent = String(ENEMY_KILL_GOAL);
    timeLeftEl.textContent = formatTime(STAGE_TIME);
    state.player = {
      x: state.width / 2,
      y: state.height - 96,
      w: 88,
      h: 70,
      speed: 320,
      drawScale: 1.7,
    };
    layoutDesertProps();
  }

  function startGame() {
    showScreen(gameScreen);
    resize();
    resetGame();
    state.running = true;
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(loop);
  }

  function endGame(won, reason) {
    state.running = false;
    cancelAnimationFrame(state.raf);
    if (won) {
      overTitleEl.textContent = "過關成功";
      overMessageEl.innerHTML =
        `1 分鐘內擊落 ${ENEMY_KILL_GOAL} 架！獲得金錢 <span id="final-score">${state.score}</span>`;
    } else {
      overTitleEl.textContent = "任務失敗";
      overMessageEl.innerHTML =
        `時間到！擊落 ${state.enemiesKilled}/${ENEMY_KILL_GOAL} · 獲得金錢 <span id="final-score">${state.score}</span>`;
    }
    showScreen(overScreen);
  }

  function checkStageClear() {
    if (state.cleared) return;
    if (state.enemiesKilled >= ENEMY_KILL_GOAL) {
      state.cleared = true;
      endGame(true);
    }
  }

  function backToMenu() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    showScreen(titleScreen);
  }

  function spawnEnemy() {
    if (state.enemiesSpawned >= ENEMY_SPAWN_TOTAL) return;
    const size = rand(34, 48);
    state.enemies.push({
      x: rand(size, state.width - size),
      y: -size,
      w: size,
      h: size * 0.85,
      speed: rand(90, 170) + state.enemiesKilled * 0.5,
      sway: rand(0, Math.PI * 2),
      swaySpeed: rand(1.2, 2.4),
      hp: 1,
    });
    state.enemiesSpawned += 1;
  }

  function registerKill(x, y) {
    state.enemiesKilled += 1;
    enemyCountEl.textContent = String(state.enemiesKilled);
    spawnMoney(x, y, 10);
    burst(x, y, "#ffe08a", 14);
    burst(x, y, "#f0c040", 8);
    checkStageClear();
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

  function spawnMoney(x, y, value) {
    // 敵機位置變成金錢，先停一下讓玩家看清楚，再慢慢落下
    state.moneys.push({
      x: clamp(x, 24, state.width - 24),
      y: clamp(y, 40, state.height - 48),
      w: 36,
      h: 36,
      vx: rand(-25, 25),
      vy: 0,
      value,
      spin: 0,
      life: 0,
      grounded: 0,
      floatTime: 0.45,
    });
  }

  function collectMoney(m, index) {
    state.score += m.value;
    scoreEl.textContent = String(state.score);
    burst(m.x, m.y, "#ffd700", 8);
    burst(m.x, m.y, "#fff3a0", 4);
    state.moneys.splice(index, 1);
  }

  // 以中心點＋寬高做 AABB，略放大讓射擊手感更準
  function hitTest(a, b, pad = 0) {
    const aw = (a.w || 0) * 0.5 + pad;
    const ah = (a.h || 0) * 0.5 + pad;
    const bw = (b.w || 0) * 0.5 + pad;
    const bh = (b.h || 0) * 0.5 + pad;
    return Math.abs(a.x - b.x) <= aw + bw && Math.abs(a.y - b.y) <= ah + bh;
  }

  function update(dt) {
    const p = state.player;
    let mx = 0;
    let my = 0;

    state.timeLeft -= dt;
    timeLeftEl.textContent = formatTime(state.timeLeft);
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      timeLeftEl.textContent = formatTime(0);
      if (state.enemiesKilled >= ENEMY_KILL_GOAL) {
        endGame(true);
      } else {
        endGame(false, "time");
      }
      return;
    }

    if (state.keys.ArrowLeft || state.keys.a || state.keys.A) mx -= 1;
    if (state.keys.ArrowRight || state.keys.d || state.keys.D) mx += 1;
    if (state.keys.ArrowUp || state.keys.w || state.keys.W) my -= 1;
    if (state.keys.ArrowDown || state.keys.s || state.keys.S) my += 1;

    if (state.pointerActive) {
      const dx = state.pointerX - p.x;
      mx = clamp(dx / 40, -1, 1);
      my = 0;
    }

    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my) || 1;
      p.x += (mx / len) * p.speed * dt;
      p.y += (my / len) * p.speed * dt;
    }

    p.x = clamp(p.x, 44, state.width - 44);
    p.y = clamp(p.y, state.height * 0.5, state.height - 56);

    state.shootCooldown -= dt;
    if (state.shootCooldown <= 0) {
      // 小鴨鴨炸彈（碰撞箱對齊畫面大小）
      state.bullets.push({
        x: p.x,
        y: p.y - 48,
        w: 30,
        h: 30,
        speed: 420,
        spin: rand(0, Math.PI * 2),
        spinSpeed: rand(6, 10),
      });
      state.shootCooldown = 0.16;
    }

    // 先更新子彈位置，再用較大判定檢查是否擊中敵機
    state.bullets.forEach((b) => {
      b.y -= b.speed * dt;
      b.spin += b.spinSpeed * dt;
    });
    state.bullets = state.bullets.filter((b) => b.y > -40);

    // 200 架會陸續出現，節奏加快以便一分鐘內有機會擊落 100
    if (state.enemiesSpawned < ENEMY_SPAWN_TOTAL) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy();
        if (state.enemiesSpawned < ENEMY_SPAWN_TOTAL && Math.random() < 0.45) {
          spawnEnemy();
        }
        const pace = Math.max(0.18, 0.42 - state.enemiesKilled * 0.0015);
        state.spawnTimer = pace;
      }
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
        // 炸彈對敵機多給一點容錯，避免「看起來打中卻沒判定」
        if (hitTest(e, b, 8)) {
          state.bullets.splice(j, 1);
          dead = true;
          registerKill(e.x, e.y);
          if (!state.running) return;
          break;
        }
      }

      if (!dead && e.y > state.height + 40) {
        dead = true;
      }

      // 生命無限：撞到敵機只短暫無敵，不扣命、不結束
      if (!dead && state.invuln <= 0 && hitTest(e, p, 2)) {
        dead = true;
        state.invuln = 1.2;
        burst(p.x, p.y, "#7dba5a", 16);
      }

      if (dead) state.enemies.splice(i, 1);
    }

    if (!state.running) return;

    state.particles = state.particles.filter((pt) => {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.98;
      pt.vy *= 0.98;
      return pt.life > 0;
    });

    // 金錢：先浮現，再落下，需飛過去撿（不瞬間入袋）
    for (let i = state.moneys.length - 1; i >= 0; i -= 1) {
      const m = state.moneys[i];
      m.life += dt;
      m.spin += dt * 4;

      if (m.life < m.floatTime) {
        m.y += Math.sin(m.life * 12) * 0.4;
      } else {
        m.vy += 90 * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.vx *= 0.99;
      }

      m.x = clamp(m.x, 20, state.width - 20);

      // 變身完成後才能撿；避開剛生成就與戰機重疊被立刻吃掉
      if (m.life > 0.35 && hitTest(m, state.player, 4)) {
        collectMoney(m, i);
        continue;
      }

      // 落到地面後停留，等玩家來撿；太久才自動入帳
      if (m.y > state.height - 36) {
        m.y = state.height - 36;
        m.vy = 0;
        m.vx *= 0.8;
        m.grounded += dt;
        if (m.grounded > 6) {
          collectMoney(m, i);
        }
      }
    }

    state.meerkats.forEach((m) => {
      m.bob += m.bobSpeed * dt;
    });

    state.puddingDogs.forEach((dog) => {
      dog.bob += dog.bobSpeed * dt;
    });

    if (state.desertDuck) state.desertDuck.bob += dt * 2.2;
    if (state.ultraman) {
      state.ultraman.bob += dt * 1.6;
      state.ultraman.armPhase += dt * 2.5;
    }

    state.sandOffset += 40 * dt;

    if (state.invuln > 0) state.invuln -= dt;

    if (state.hintTimer > 0) {
      state.hintTimer -= dt;
      if (state.hintTimer <= 0) hintEl.classList.add("is-faded");
    }
  }

  function drawDuck(x, y, scale = 1, facing = 1, options = {}) {
    const { pilot = false, bomb = false } = options;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale * facing, scale);

    // 身體
    ctx.fillStyle = bomb ? "#f2d24b" : "#ffe56a";
    ctx.beginPath();
    ctx.ellipse(0, 2, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 頭
    ctx.beginPath();
    ctx.arc(8, -4, 6.5, 0, Math.PI * 2);
    ctx.fill();

    // 翅膀
    ctx.fillStyle = bomb ? "#e6c43d" : "#f0d255";
    ctx.beginPath();
    ctx.ellipse(-2, 2, 5, 3.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // 嘴巴
    ctx.fillStyle = "#f0872a";
    ctx.beginPath();
    ctx.moveTo(13, -4);
    ctx.lineTo(19, -2);
    ctx.lineTo(13, 0);
    ctx.closePath();
    ctx.fill();

    // 眼睛
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.arc(10, -5.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    if (pilot) {
      // 小飛行帽
      ctx.fillStyle = "#3d6b2e";
      ctx.beginPath();
      ctx.ellipse(7, -9, 5, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c23b2a";
      ctx.beginPath();
      ctx.arc(7, -11, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (bomb) {
      // 炸彈引信
      ctx.strokeStyle = "#5a4030";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.quadraticCurveTo(-12, -10, -8, -12);
      ctx.stroke();
      ctx.fillStyle = "#ff8a3a";
      ctx.beginPath();
      ctx.arc(-8, -12, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPalmWing(side) {
    // 手掌大小的機翼，帶手掌紋理
    ctx.save();
    ctx.scale(side, 1);

    ctx.fillStyle = "#3f8f3a";
    ctx.beginPath();
    ctx.moveTo(4, 2);
    ctx.quadraticCurveTo(18, -2, 26, 4);
    ctx.quadraticCurveTo(22, 12, 10, 12);
    ctx.quadraticCurveTo(6, 10, 4, 6);
    ctx.closePath();
    ctx.fill();

    // 手掌輪廓
    ctx.fillStyle = "#2f6f2c";
    ctx.beginPath();
    ctx.ellipse(16, 6, 7, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 五指
    const fingers = [
      [11, 1, -0.5],
      [14, -1, -0.15],
      [17, -1.5, 0.1],
      [20, -0.5, 0.35],
      [22, 3, 0.9],
    ];
    fingers.forEach(([fx, fy, rot]) => {
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.2, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 掌心亮點
    ctx.fillStyle = "rgba(180, 220, 140, 0.35)";
    ctx.beginPath();
    ctx.ellipse(15, 7, 3, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawDecalDuck(x, y, s = 0.45) {
    drawDuck(x, y, s, 1, {});
  }

  function drawBackground() {
    // 沙漠天空
    const sky = ctx.createLinearGradient(0, 0, 0, state.height);
    sky.addColorStop(0, "#f0c98a");
    sky.addColorStop(0.35, "#e8b56a");
    sky.addColorStop(0.55, "#d7a05a");
    sky.addColorStop(1, "#c48a48");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, state.width, state.height);

    // 烈日
    const sunX = state.width * 0.78;
    const sunY = state.height * 0.16;
    const sunR = Math.min(state.width, state.height) * 0.09;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2);
    sunGrad.addColorStop(0, "rgba(255, 245, 200, 0.95)");
    sunGrad.addColorStop(0.35, "rgba(255, 190, 90, 0.7)");
    sunGrad.addColorStop(1, "rgba(255, 170, 70, 0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2, 0, Math.PI * 2);
    ctx.fill();

    // 沙丘
    state.dunes.forEach((dune, idx) => {
      ctx.fillStyle = dune.color;
      ctx.beginPath();
      ctx.moveTo(0, state.height);
      for (let x = 0; x <= state.width; x += 12) {
        const y =
          dune.y +
          Math.sin((x + state.sandOffset * (0.3 + idx * 0.15)) * 0.02) * dune.amp +
          Math.sin((x * 0.01) + idx) * 10;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(state.width, state.height);
      ctx.closePath();
      ctx.fill();
    });

    // 沙漠裡的奧特曼
    if (state.ultraman) {
      const u = state.ultraman;
      drawUltraman(u.x, u.y + Math.sin(u.bob) * 2, u.scale, u.armPhase);
    }

    // 沙漠裡還有一隻鴨鴨
    if (state.desertDuck) {
      const d = state.desertDuck;
      drawDuck(d.x, d.y + Math.sin(d.bob) * 3, d.scale, d.facing, {});
    }

    // 左邊 20 隻布丁狗
    state.puddingDogs.forEach((dog) => {
      drawPuddingDog(dog.x, dog.y + Math.sin(dog.bob) * 3, dog.scale);
    });

    // 右邊 12 隻狐獴（動物，清楚可見）
    state.meerkats.forEach((m) => {
      drawMeerkat(m.x, m.y + Math.sin(m.bob) * 2.5, m.scale);
    });
  }

  function drawMeerkat(x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // 尾巴
    ctx.strokeStyle = "#a67c4a";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(6, 18);
    ctx.quadraticCurveTo(16, 10, 14, -2);
    ctx.stroke();

    // 後腳
    ctx.fillStyle = "#c9955a";
    ctx.beginPath();
    ctx.ellipse(-5, 22, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(5, 22, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // 身體（站立）
    const body = ctx.createLinearGradient(-8, 0, 8, 0);
    body.addColorStop(0, "#b8844c");
    body.addColorStop(0.5, "#d4a06a");
    body.addColorStop(1, "#a6743e");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 8, 8, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // 肚皮
    ctx.fillStyle = "#f0d8b0";
    ctx.beginPath();
    ctx.ellipse(0, 10, 4.5, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 手臂
    ctx.fillStyle = "#c9955a";
    ctx.beginPath();
    ctx.ellipse(-8, 6, 2.4, 6, 0.25, 0, Math.PI * 2);
    ctx.ellipse(8, 6, 2.4, 6, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // 頭
    ctx.fillStyle = "#d4a06a";
    ctx.beginPath();
    ctx.ellipse(0, -10, 8.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 耳朵
    ctx.fillStyle = "#b8844c";
    ctx.beginPath();
    ctx.ellipse(-6.5, -16, 2.6, 3.2, -0.2, 0, Math.PI * 2);
    ctx.ellipse(6.5, -16, 2.6, 3.2, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0d8b0";
    ctx.beginPath();
    ctx.ellipse(-6.5, -16, 1.2, 1.6, -0.2, 0, Math.PI * 2);
    ctx.ellipse(6.5, -16, 1.2, 1.6, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 眼周深色
    ctx.fillStyle = "#5a3a22";
    ctx.beginPath();
    ctx.ellipse(-3.2, -11, 2.4, 2.8, 0, 0, Math.PI * 2);
    ctx.ellipse(3.2, -11, 2.4, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛（亮）
    ctx.fillStyle = "#1a120c";
    ctx.beginPath();
    ctx.arc(-3.2, -11, 1.35, 0, Math.PI * 2);
    ctx.arc(3.2, -11, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-3.6, -11.5, 0.45, 0, Math.PI * 2);
    ctx.arc(2.8, -11.5, 0.45, 0, Math.PI * 2);
    ctx.fill();

    // 鼻子
    ctx.fillStyle = "#2a1a10";
    ctx.beginPath();
    ctx.ellipse(0, -7.5, 1.5, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // 嘴巴
    ctx.strokeStyle = "#2a1a10";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.quadraticCurveTo(-2.5, -5, -3.5, -5.5);
    ctx.moveTo(0, -6.5);
    ctx.quadraticCurveTo(2.5, -5, 3.5, -5.5);
    ctx.stroke();

    ctx.restore();
  }

  function drawPuddingDog(x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // 身體
    ctx.fillStyle = "#f6d85a";
    ctx.beginPath();
    ctx.ellipse(0, 6, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 頭
    ctx.beginPath();
    ctx.ellipse(0, -6, 12, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // 耳朵
    ctx.fillStyle = "#e8c84a";
    ctx.beginPath();
    ctx.ellipse(-10, -10, 4.5, 6, -0.4, 0, Math.PI * 2);
    ctx.ellipse(10, -10, 4.5, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // 棕色貝雷帽
    ctx.fillStyle = "#8b5a2b";
    ctx.beginPath();
    ctx.ellipse(0, -14, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, -16, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 臉頰
    ctx.fillStyle = "#f0a8a0";
    ctx.beginPath();
    ctx.ellipse(-7, -3, 2.4, 1.8, 0, 0, Math.PI * 2);
    ctx.ellipse(7, -3, 2.4, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.arc(-4, -6, 1.3, 0, Math.PI * 2);
    ctx.arc(4, -6, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 鼻子嘴巴
    ctx.fillStyle = "#5a3a20";
    ctx.beginPath();
    ctx.ellipse(0, -3.2, 1.6, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5a3a20";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(-3, 0, -5, -1);
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(3, 0, 5, -1);
    ctx.stroke();

    // 腳
    ctx.fillStyle = "#f6d85a";
    ctx.beginPath();
    ctx.ellipse(-8, 16, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(8, 16, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawUltraman(x, y, scale = 1, armPhase = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const armLift = Math.sin(armPhase) * 0.35;

    // 腿
    ctx.fillStyle = "#d8dde4";
    ctx.fillRect(-9, 18, 7, 22);
    ctx.fillRect(2, 18, 7, 22);
    ctx.fillStyle = "#c23b2a";
    ctx.fillRect(-9, 28, 7, 5);
    ctx.fillRect(2, 28, 7, 5);

    // 身體（銀＋紅）
    ctx.fillStyle = "#e8edf2";
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(8, -8);
    ctx.quadraticCurveTo(12, -8, 12, -4);
    ctx.lineTo(12, 16);
    ctx.quadraticCurveTo(12, 20, 8, 20);
    ctx.lineTo(-8, 20);
    ctx.quadraticCurveTo(-12, 20, -12, 16);
    ctx.lineTo(-12, -4);
    ctx.quadraticCurveTo(-12, -8, -8, -8);
    ctx.closePath();
    ctx.fill();

    // 紅色線條／腹甲
    ctx.fillStyle = "#c23b2a";
    ctx.fillRect(-12, 2, 24, 5);
    ctx.fillRect(-3, -8, 6, 28);

    // 彩色計時器
    ctx.fillStyle = "#f0d24a";
    ctx.beginPath();
    ctx.arc(0, 4.5, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6a10";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 手臂（經典舉手姿勢微動）
    ctx.save();
    ctx.translate(-12, -2);
    ctx.rotate(-0.9 + armLift);
    ctx.fillStyle = "#e8edf2";
    ctx.fillRect(-4, 0, 6, 20);
    ctx.fillStyle = "#c23b2a";
    ctx.fillRect(-4, 14, 6, 4);
    ctx.restore();

    ctx.save();
    ctx.translate(12, -2);
    ctx.rotate(0.9 - armLift);
    ctx.fillStyle = "#e8edf2";
    ctx.fillRect(-2, 0, 6, 20);
    ctx.fillStyle = "#c23b2a";
    ctx.fillRect(-2, 14, 6, 4);
    ctx.restore();

    // 頭
    ctx.fillStyle = "#e8edf2";
    ctx.beginPath();
    ctx.ellipse(0, -18, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // 頭冠
    ctx.fillStyle = "#c23b2a";
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(5, -22);
    ctx.lineTo(-5, -22);
    ctx.closePath();
    ctx.fill();

    // 耳朵飾
    ctx.fillStyle = "#c23b2a";
    ctx.beginPath();
    ctx.moveTo(-11, -20);
    ctx.lineTo(-18, -16);
    ctx.lineTo(-11, -12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(11, -20);
    ctx.lineTo(18, -16);
    ctx.lineTo(11, -12);
    ctx.closePath();
    ctx.fill();

    // 眼睛（亮黃）
    ctx.fillStyle = "#ffe14a";
    ctx.beginPath();
    ctx.ellipse(-4.5, -18, 3.2, 4.5, -0.15, 0, Math.PI * 2);
    ctx.ellipse(4.5, -18, 3.2, 4.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.beginPath();
    ctx.ellipse(-5.2, -19.5, 1.1, 1.6, 0, 0, Math.PI * 2);
    ctx.ellipse(3.8, -19.5, 1.1, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 嘴線
    ctx.strokeStyle = "#9aa3ad";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-3, -12);
    ctx.lineTo(3, -12);
    ctx.stroke();

    ctx.restore();
  }

  function drawMoney(m) {
    const pop = Math.min(1, m.life * 5);
    const scale = 0.55 + pop * 0.7;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.sin(m.spin) * 0.35);
    ctx.scale(scale, scale);

    // 金幣（加大，清楚可見）
    ctx.fillStyle = "rgba(255, 210, 80, 0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();

    const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 18);
    g.addColorStop(0, "#fff8c8");
    g.addColorStop(0.55, "#ffd24a");
    g.addColorStop(1, "#c99312");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6410";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#7a5808";
    ctx.font = "bold 16px Zen Maru Gothic, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("金", 0, 1);

    // 剛從敵機變成金錢時的爆發光環
    if (m.life < 0.55) {
      ctx.globalAlpha = 1 - m.life / 0.55;
      ctx.strokeStyle = "#fff2a0";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + m.life * 28, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    const blink = state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.drawScale || 1.7, p.drawScale || 1.7);

    // 尾焰
    ctx.fillStyle = "rgba(255, 170, 70, 0.9)";
    ctx.beginPath();
    ctx.moveTo(-5, 18);
    ctx.lineTo(0, 30 + Math.sin(performance.now() / 45) * 5);
    ctx.lineTo(5, 18);
    ctx.fill();

    // 手掌大的雙翼
    drawPalmWing(-1);
    drawPalmWing(1);

    // 綠色戰機機身
    const body = ctx.createLinearGradient(-14, 0, 14, 0);
    body.addColorStop(0, "#2f6b2a");
    body.addColorStop(0.5, "#4aa143");
    body.addColorStop(1, "#2a5f28");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.quadraticCurveTo(14, -2, 10, 18);
    ctx.lineTo(-10, 18);
    ctx.quadraticCurveTo(-14, -2, 0, -24);
    ctx.fill();

    // 機身線條
    ctx.strokeStyle = "rgba(20, 60, 20, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 16);
    ctx.stroke();

    // 機身上五隻小鴨圖案
    const decals = [
      [0, -14],
      [-5, -4],
      [5, -4],
      [-4, 6],
      [4, 6],
    ];
    decals.forEach(([dx, dy]) => drawDecalDuck(dx, dy, 0.38));

    // 座艙玻璃
    ctx.fillStyle = "rgba(160, 220, 255, 0.55)";
    ctx.beginPath();
    ctx.ellipse(0, -8, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(30, 80, 40, 0.5)";
    ctx.stroke();

    // 誰在開飛機？小鴨鴨！
    drawDuck(0, -9, 0.55, 1, { pilot: true });

    // 鼻錐
    ctx.fillStyle = "#245522";
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(5, -14);
    ctx.lineTo(-5, -14);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    ctx.fillStyle = "#5a4030";
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(18, -6);
    ctx.lineTo(6, -2);
    ctx.lineTo(0, -16);
    ctx.lineTo(-6, -2);
    ctx.lineTo(-18, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#a84b2a";
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#efc36a";
    ctx.beginPath();
    ctx.ellipse(0, -2, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawBullets() {
    state.bullets.forEach((b) => {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.spin);
      drawDuck(0, 0, 0.85, 1, { bomb: true });
      ctx.restore();
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

    // 近景薄霧，強化霧濛感
    const haze = ctx.createLinearGradient(0, state.height * 0.45, 0, state.height);
    haze.addColorStop(0, "rgba(255, 236, 200, 0)");
    haze.addColorStop(1, "rgba(255, 230, 190, 0.18)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, state.height * 0.45, state.width, state.height * 0.55);

    // 金錢畫在霧之上，避免看不見、無法去撿
    state.moneys.forEach(drawMoney);
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
    state.player.y = clamp(pos.y, state.height * 0.5, state.height - 56);
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

  showScreen(titleScreen);
})();
