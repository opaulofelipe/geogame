(() => {
  const HIT_RADIUS_KM = 350;
  const EARTH_RADIUS_KM = 6371;

  const el = {
    clueScreen: document.getElementById("clueScreen"),
    globeScreen: document.getElementById("globeScreen"),
    globe: document.getElementById("globeViz"),
    cardProgress: document.getElementById("cardProgress"),
    globeProgress: document.getElementById("globeProgress"),
    clueImage: document.getElementById("clueImage"),
    imageSkeleton: document.getElementById("imageSkeleton"),
    imageFallback: document.getElementById("imageFallback"),
    imageSource: document.getElementById("imageSource"),
    cardPeriod: document.getElementById("cardPeriod"),
    clueTitle: document.getElementById("clueTitle"),
    clueText: document.getElementById("clueText"),
    distance: document.getElementById("distanceValue"),
    guessStatus: document.getElementById("guessStatus"),
    revealBox: document.getElementById("revealBox"),
    revealTitle: document.getElementById("revealTitle"),
    revealText: document.getElementById("revealText"),
    btnToGlobe: document.getElementById("btnToGlobe"),
    btnSkipCard: document.getElementById("btnSkipCard"),
    btnBackCard: document.getElementById("btnBackCard"),
    btnConfirm: document.getElementById("btnConfirm"),
    btnNext: document.getElementById("btnNext"),
    toast: document.getElementById("toast")
  };

  let locations = [];
  let bag = [];
  let current = null;
  let roundNumber = 0;
  let pendingGuess = null;
  let guessPoint = null;
  let answerPoint = null;
  let revealPath = null;
  let solved = false;
  let toastTimer = null;

  const world = Globe()
    .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
    .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
    .backgroundImageUrl("https://unpkg.com/three-globe/example/img/night-sky.png")
    .showAtmosphere(true)
    .atmosphereColor("#c68b60")
    .atmosphereAltitude(0.2)
    .onGlobeClick(({ lat, lng }) => {
      if (!current || solved || el.globeScreen.hidden) return;
      setPendingGuess(lat, lng);
    })(el.globe);

  world.width(window.innerWidth);
  world.height(window.innerHeight);
  world.pointOfView({ lat: 12, lng: -18, altitude: 2.25 }, 0);


  const controls = world.controls();
  if (controls) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 150;
    controls.maxDistance = 600;
  }

  window.addEventListener("resize", resizeGlobe);
  el.btnToGlobe.addEventListener("click", showGlobe);
  el.btnBackCard.addEventListener("click", showCard);
  el.btnSkipCard.addEventListener("click", nextRound);
  el.btnNext.addEventListener("click", nextRound);
  el.btnConfirm.addEventListener("click", confirmGuess);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.globeScreen.hidden) showCard();
  });

  function resizeGlobe() {
    world.width(window.innerWidth);
    world.height(window.innerHeight);
  }

  function applyTouchFix() {
    const canvas = el.globe.querySelector("canvas");
    if (!canvas || canvas.dataset.touchReady) return Boolean(canvas);
    canvas.dataset.touchReady = "true";
    canvas.style.touchAction = "none";
    const preventDefault = (event) => event.preventDefault();
    canvas.addEventListener("touchstart", preventDefault, { passive: false });
    canvas.addEventListener("touchmove", preventDefault, { passive: false });
    return true;
  }

  let touchAttempts = 0;
  const touchTimer = window.setInterval(() => {
    touchAttempts += 1;
    if (applyTouchFix() || touchAttempts > 40) window.clearInterval(touchTimer);
  }, 50);

  function toRad(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatKm(km) {
    return Number.isFinite(km) ? `${Math.round(km).toLocaleString("pt-BR")} km` : "—";
  }

  function imageUrl(item) {
    if (item.imagem) return item.imagem;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(item.imagemArquivo)}?width=1600`;
  }

  function imageSourceUrl(item) {
    if (item.fonteImagem) return item.fonteImagem;
    return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(item.imagemArquivo)}`;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add("show");
    toastTimer = window.setTimeout(() => el.toast.classList.remove("show"), 3200);
  }

  function updatePointsLayer() {
    const points = [guessPoint, answerPoint].filter(Boolean);
    world
      .pointsData(points)
      .pointLat((point) => point.lat)
      .pointLng((point) => point.lng)
      .pointAltitude((point) => point.altitude)
      .pointRadius((point) => point.radius)
      .pointColor((point) => point.color);
  }

  function updatePathLayer() {
    world
      .pathsData(revealPath ? [revealPath] : [])
      .pathPoints((path) => path)
      .pathPointLat((point) => point.lat)
      .pathPointLng((point) => point.lng)
      .pathColor(() => "rgba(242, 168, 95, 0.96)")
      .pathStroke(() => 2.1)
      .pathDashLength(() => 0)
      .pathDashGap(() => 0);
  }

  function clearRoundState() {
    pendingGuess = null;
    guessPoint = null;
    answerPoint = null;
    revealPath = null;
    solved = false;
    updatePointsLayer();
    updatePathLayer();

    el.distance.textContent = "—";
    el.guessStatus.textContent = "Gire, aproxime e marque onde você acha que fica o sítio.";
    el.revealBox.hidden = true;
    el.btnConfirm.disabled = true;
    el.btnNext.hidden = true;
  }

  function setPendingGuess(lat, lng) {
    pendingGuess = { lat, lng };
    guessPoint = {
      lat,
      lng,
      radius: 0.34,
      altitude: 0.03,
      color: "rgba(255, 248, 235, 0.96)"
    };
    revealPath = null;
    updatePathLayer();
    updatePointsLayer();

    el.btnConfirm.disabled = false;
    el.distance.textContent = "—";
    el.guessStatus.textContent = "Ponto marcado. Você ainda pode tocar em outro lugar antes de confirmar.";
  }

  function confirmGuess() {
    if (!current || solved || !pendingGuess) return;

    const distance = haversineKm(pendingGuess.lat, pendingGuess.lng, current.lat, current.lng);
    el.distance.textContent = formatKm(distance);

    if (distance > HIT_RADIUS_KM) {
      guessPoint.color = "rgba(225, 112, 88, 0.96)";
      updatePointsLayer();
      el.btnConfirm.disabled = true;
      el.guessStatus.textContent = `Ainda não: seu palpite ficou a ${formatKm(distance)}. Marque outro ponto e tente de novo.`;
      showToast("Quase uma nova expedição — tente outro ponto.");
      return;
    }

    solved = true;
    answerPoint = {
      lat: current.lat,
      lng: current.lng,
      radius: 0.46,
      altitude: 0.05,
      color: "rgba(126, 195, 120, 0.98)"
    };
    guessPoint.color = "rgba(255, 248, 235, 0.96)";
    revealPath = [
      { lat: pendingGuess.lat, lng: pendingGuess.lng },
      { lat: current.lat, lng: current.lng }
    ];
    updatePathLayer();
    updatePointsLayer();

    el.btnConfirm.disabled = true;
    el.btnNext.hidden = false;
    el.guessStatus.textContent = `Acertou: ${formatKm(distance)} do ponto de referência.`;
    el.revealTitle.textContent = current.resposta;
    el.revealText.textContent = `${current.pais} · ${current.revelacao}`;
    el.revealBox.hidden = false;

    world.pointOfView({ lat: current.lat, lng: current.lng, altitude: 1.68 }, 850);
    celebrate();
    showToast("Você encontrou este patrimônio!");
  }

  function celebrate() {
    if (typeof window.confetti !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const options = { origin: { y: 0.76 }, spread: 68, ticks: 150, gravity: 1.08, scalar: 0.82 };
    window.confetti({ ...options, particleCount: 64, startVelocity: 34, colors: ["#f2a85f", "#f3e7d2", "#6e9a69"] });
  }

  function refillBag() {
    bag = locations.slice();
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function pickNext() {
    if (!bag.length) {
      refillBag();
      roundNumber = 0;
    }
    roundNumber += 1;
    return bag.pop();
  }

  function setProgress() {
    const label = `Carta ${roundNumber} de ${locations.length}`;
    el.cardProgress.textContent = label;
    el.globeProgress.textContent = label;
  }

  function loadCardImage(item) {
    el.clueImage.classList.remove("is-loaded");
    el.imageSkeleton.hidden = false;
    el.imageFallback.hidden = true;
    el.clueImage.alt = item.imagemAlt;
    el.imageSource.href = imageSourceUrl(item);

    el.clueImage.onload = () => {
      el.imageSkeleton.hidden = true;
      el.imageFallback.hidden = true;
      el.clueImage.classList.add("is-loaded");
    };
    el.clueImage.onerror = () => {
      el.imageSkeleton.hidden = true;
      el.imageFallback.hidden = false;
      el.clueImage.classList.remove("is-loaded");
    };
    el.clueImage.src = imageUrl(item);
  }

  function startRound(target) {
    current = target;
    clearRoundState();
    setProgress();

    el.clueTitle.textContent = current.nome;
    el.clueText.textContent = current.pista;
    el.cardPeriod.textContent = current.periodo;
    loadCardImage(current);

    el.btnToGlobe.disabled = false;
    el.btnSkipCard.disabled = false;
    world.pointOfView({ lat: 12, lng: -18, altitude: 2.25 }, 600);
  }

  function showCard() {
    el.globeScreen.hidden = true;
    el.clueScreen.hidden = false;
    window.requestAnimationFrame(() => el.btnToGlobe.focus({ preventScroll: true }));
  }

  function showGlobe() {
    if (!current) return;
    el.clueScreen.hidden = true;
    el.globeScreen.hidden = false;
    window.requestAnimationFrame(() => {
      resizeGlobe();
      el.btnBackCard.focus({ preventScroll: true });
    });
  }

  function nextRound() {
    startRound(pickNext());
    showCard();
  }

  function normalizeLocations(rawLocations) {
    const ids = new Set();
    return rawLocations.map((item, index) => {
      const normalized = {
        ...item,
        id: item.id || `carta-${index + 1}`,
        lat: Number(item.lat),
        lng: Number(item.lng ?? item.lon)
      };

      if (ids.has(normalized.id)) throw new Error(`ID duplicado: ${normalized.id}`);
      if (!Number.isFinite(normalized.lat) || normalized.lat < -90 || normalized.lat > 90) {
        throw new Error(`Latitude inválida em ${normalized.id}`);
      }
      if (!Number.isFinite(normalized.lng) || normalized.lng < -180 || normalized.lng > 180) {
        throw new Error(`Longitude inválida em ${normalized.id}`);
      }
      if (!normalized.nome || !normalized.pista || !normalized.resposta || !normalized.imagemArquivo) {
        throw new Error(`Carta incompleta: ${normalized.id}`);
      }

      ids.add(normalized.id);
      return normalized;
    });
  }

  async function init() {
    try {
      const response = await fetch("./locations.json?v=4", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar locations.json`);
      const rawLocations = await response.json();
      if (!Array.isArray(rawLocations) || rawLocations.length !== 64) {
        throw new Error("A coleção deve conter exatamente 64 cartas.");
      }

      locations = normalizeLocations(rawLocations);
      refillBag();
      updatePathLayer();
      startRound(pickNext());
    } catch (error) {
      console.error(error);
      el.clueTitle.textContent = "Não foi possível abrir as cartas";
      el.clueText.textContent = "Recarregue a página. Se o problema continuar, verifique o console do navegador.";
      el.imageSkeleton.hidden = true;
      el.imageFallback.hidden = false;
    }
  }

  init();
})();
