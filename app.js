(() => {
  const elGlobe = document.getElementById("globeViz");

  const elPrompt = document.getElementById("placePrompt");
  const elDistance = document.getElementById("distanceValue");

  const revealBox = document.getElementById("revealBox");
  const revealText = document.getElementById("revealText");

  const btnConfirm = document.getElementById("btnConfirm");
  const btnNext = document.getElementById("btnNext");

  const toast = document.getElementById("toast");
  const toastTitle = document.getElementById("toastTitle");
  const toastSub = document.getElementById("toastSub");
  const toastClose = document.getElementById("toastClose");

  const HIT_RADIUS_KM = 100;
  const EARTH_RADIUS_KM = 6371;

  let locations = [];
  let bag = [];
  let current = null;

  let pendingGuess = null; // {lat, lng}
  let solved = false;

  let guessPoint = null;
  let answerPoint = null;

  // ✅ linha reta (polyline) ligando chute -> resposta
  let revealPath = null; // [{lat,lng},{lat,lng}]

  // Globe.gl
  const world = Globe()
    .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
    .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
    .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
    .showAtmosphere(true)
    .atmosphereAltitude(0.22)
    .onGlobeClick(({ lat, lng }) => {
      if (!current) return;
      if (solved) return;
      setPendingGuess(lat, lng);
    })(elGlobe);

  world.width(window.innerWidth);
  world.height(window.innerHeight);
  world.pointOfView({ lat: 15, lng: -20, altitude: 2.2 }, 0);

  const controls = world.controls();
  if (controls) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 150;
    controls.maxDistance = 600;
  }

  window.addEventListener("resize", () => {
    world.width(window.innerWidth);
    world.height(window.innerHeight);
  });

  // iOS touch fix (somente no canvas)
  function applyIOSTouchFix() {
    const canvas = elGlobe.querySelector("canvas");
    if (!canvas) return;

    canvas.style.touchAction = "none";
    const prevent = (e) => e.preventDefault();
    canvas.addEventListener("touchstart", prevent, { passive: false });
    canvas.addEventListener("touchmove", prevent, { passive: false });
  }

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    applyIOSTouchFix();
    if (elGlobe.querySelector("canvas") || tries > 40) clearInterval(t);
  }, 50);

  btnConfirm.addEventListener("click", () => {
    if (!current || solved || !pendingGuess) return;
    confirmGuess();
  });

  btnNext.addEventListener("click", () => {
    startRound(pickNext());
  });

  toastClose.addEventListener("click", hideToast);
  toast.addEventListener("click", (e) => {
    if (e.target === toast) hideToast();
  });

  function toRad(deg) { return (deg * Math.PI) / 180; }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
  }

  function formatKm(km) {
    if (!Number.isFinite(km)) return "—";
    return `${Math.round(km)} km`;
  }

  function showToast(title, sub) {
    toastTitle.textContent = title;
    toastSub.textContent = sub || "";
    toast.classList.add("show");
    toast.setAttribute("aria-hidden", "false");
  }

  function hideToast() {
    toast.classList.remove("show");
    toast.setAttribute("aria-hidden", "true");
  }

  function confettiBurst() {
    if (typeof confetti !== "function") return;
    const opts = { origin: { y: 0.75 }, spread: 70, ticks: 180, gravity: 1.05, scalar: 0.95 };
    confetti({ ...opts, particleCount: 90, startVelocity: 38 });
    setTimeout(() => confetti({ ...opts, particleCount: 60, startVelocity: 30 }), 140);
    setTimeout(() => confetti({ ...opts, particleCount: 55, startVelocity: 28 }), 260);
  }

  function updatePointsLayer() {
    const pts = [];
    if (guessPoint) pts.push(guessPoint);
    if (answerPoint) pts.push(answerPoint);

    world
      .pointsData(pts)
      .pointLat(d => d.lat)
      .pointLng(d => d.lng)
      .pointAltitude(d => d.alt || 0.03)
      .pointRadius(d => d.r || 0.35)
      .pointColor(d => d.color || "rgba(255,255,255,0.9)");
  }

  // ✅ linha reta: usa pathsData
  function updatePathLayer() {
    const data = revealPath ? [revealPath] : [];

    world
      .pathsData(data)
      .pathPoints(d => d)            // d é um array de pontos
      .pathPointLat(p => p.lat)
      .pathPointLng(p => p.lng)
      .pathColor(() => "rgba(255, 80, 80, 0.95)")
      .pathStroke(() => 2.2)         // espessura
      .pathDashLength(() => 0)       // 0 = linha contínua
      .pathDashGap(() => 0);
  }

  function clearMarkers() {
    pendingGuess = null;
    guessPoint = null;
    answerPoint = null;
    revealPath = null;
    updatePointsLayer();
    updatePathLayer();
  }

  function hideReveal() {
    revealBox.hidden = true;
    revealText.textContent = "—";
  }

  function showReveal(text) {
    revealText.textContent = text || "Resposta indisponível.";
    revealBox.hidden = false;
  }

  function setPendingGuess(lat, lng) {
    pendingGuess = { lat, lng };

    guessPoint = {
      lat,
      lng,
      r: 0.35,
      alt: 0.03,
      color: "rgba(255,255,255,0.92)"
    };

    // se o jogador escolhe outro ponto antes de confirmar, apaga qualquer linha antiga
    revealPath = null;
    updatePathLayer();

    updatePointsLayer();
    btnConfirm.disabled = false;
    elDistance.textContent = "—";
    hideToast();
  }

  function confirmGuess() {
    const dist = haversineKm(pendingGuess.lat, pendingGuess.lng, current.lat, current.lng);
    elDistance.textContent = formatKm(dist);

    if (dist <= HIT_RADIUS_KM) {
      solved = true;

      answerPoint = {
        lat: current.lat,
        lng: current.lng,
        r: 0.45,
        alt: 0.05,
        color: "rgba(120,255,170,0.95)"
      };

      guessPoint.color = "rgba(255,255,255,0.95)";

      // ✅ linha reta ligando os 2 pontos
      revealPath = [
        { lat: pendingGuess.lat, lng: pendingGuess.lng },
        { lat: current.lat, lng: current.lng }
      ];
      updatePathLayer();

      updatePointsLayer();
      btnConfirm.disabled = true;

      world.pointOfView({ lat: current.lat, lng: current.lng, altitude: 1.7 }, 850);

      showReveal(current.revelacao);
      confettiBurst();
      showToast("Você acertou!", `Você ficou a ${formatKm(dist)} do ponto exato.`);
      return;
    }

    guessPoint.color = "rgba(255,190,190,0.92)";
    updatePointsLayer();
    showToast("Que pena, você errou.", `Você ficou a ${formatKm(dist)} do local correto.`);
  }

  function refillBag() {
    bag = locations.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function pickNext() {
    if (!bag.length) refillBag();
    return bag.pop();
  }

  function startRound(target) {
    current = target;
    solved = false;

    clearMarkers();
    hideReveal();
    btnConfirm.disabled = true;
    elPrompt.textContent = current?.nome ?? "—";
    elDistance.textContent = "—";
    hideToast();

    world.pointOfView({ lat: 10, lng: -20, altitude: 2.25 }, 600);
  }

  async function init() {
    try {
      const res = await fetch("./locations.json?v=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao carregar locations.json`);
      locations = await res.json();
      if (!Array.isArray(locations) || locations.length === 0) throw new Error("JSON inválido ou vazio.");

      refillBag();
      updatePathLayer(); // garante camada inicial
      startRound(pickNext());
    } catch (err) {
      console.error(err);
      elPrompt.textContent = "Erro ao carregar locais.";
      elDistance.textContent = "—";
      showToast("Erro", "Abra via servidor (Live Server/GitHub Pages) e veja o Console.");
    }
  }

  init();
})();