(() => {
  const EARTH_RADIUS_KM = 6371;
  const PLAYER_COLORS = [
    { name: "Azul", value: "#2f80ed" },
    { name: "Vermelho", value: "#e4473a" },
    { name: "Preto", value: "#111111" },
    { name: "Branco", value: "#f7f4ed" },
    { name: "Verde", value: "#2ca25f" },
    { name: "Amarelo", value: "#f2c94c" }
  ];

  const el = {
    setupScreen: document.getElementById("setupScreen"),
    clueScreen: document.getElementById("clueScreen"),
    globeScreen: document.getElementById("globeScreen"),
    globe: document.getElementById("globeViz"),
    playerSetupList: document.getElementById("playerSetupList"),
    setupStatus: document.getElementById("setupStatus"),
    btnAddPlayer: document.getElementById("btnAddPlayer"),
    btnStartGame: document.getElementById("btnStartGame"),
    cardProgress: document.getElementById("cardProgress"),
    globeProgress: document.getElementById("globeProgress"),
    clueImage: document.getElementById("clueImage"),
    imageSkeleton: document.getElementById("imageSkeleton"),
    imageFallback: document.getElementById("imageFallback"),
    imageSource: document.getElementById("imageSource"),
    clueTitle: document.getElementById("clueTitle"),
    currentPlayerDot: document.getElementById("currentPlayerDot"),
    currentPlayerName: document.getElementById("currentPlayerName"),
    turnCounter: document.getElementById("turnCounter"),
    guessStatus: document.getElementById("guessStatus"),
    revealBox: document.getElementById("revealBox"),
    revealTitle: document.getElementById("revealTitle"),
    revealText: document.getElementById("revealText"),
    roundResults: document.getElementById("roundResults"),
    btnToGlobe: document.getElementById("btnToGlobe"),
    btnSkipCard: document.getElementById("btnSkipCard"),
    btnBackCard: document.getElementById("btnBackCard"),
    btnConfirm: document.getElementById("btnConfirm"),
    btnNext: document.getElementById("btnNext"),
    scoreDrawer: document.getElementById("scoreDrawer"),
    scoreBackdrop: document.getElementById("scoreBackdrop"),
    scoreboardList: document.getElementById("scoreboardList"),
    btnCloseScore: document.getElementById("btnCloseScore"),
    btnResetScore: document.getElementById("btnResetScore"),
    scoreMenuButtons: Array.from(document.querySelectorAll("[data-score-menu]")),
    toast: document.getElementById("toast")
  };

  let locations = [];
  let bag = [];
  let current = null;
  let roundNumber = 0;
  let setupNames = ["", ""];
  let players = [];
  let currentPlayerIndex = 0;
  let roundGuesses = [];
  let pendingGuess = null;
  let visiblePoints = [];
  let revealPaths = [];
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
  el.btnAddPlayer.addEventListener("click", addPlayerSlot);
  el.btnStartGame.addEventListener("click", startGame);
  el.btnToGlobe.addEventListener("click", showGlobe);
  el.btnBackCard.addEventListener("click", showCard);
  el.btnSkipCard.addEventListener("click", skipRound);
  el.btnNext.addEventListener("click", nextRound);
  el.btnConfirm.addEventListener("click", confirmGuess);
  el.btnCloseScore.addEventListener("click", closeScoreboard);
  el.scoreBackdrop.addEventListener("click", closeScoreboard);
  el.btnResetScore.addEventListener("click", resetScores);
  el.scoreMenuButtons.forEach((button) => button.addEventListener("click", openScoreboard));

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!el.scoreDrawer.hidden) {
      closeScoreboard();
      return;
    }
    if (!el.globeScreen.hidden) showCard();
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

  function scoreForDistance(km) {
    if (km <= 300) return 10;
    if (km >= 3000) return 0;
    const score = 10 * (3000 - km) / 2700;
    return Math.round(score * 10) / 10;
  }

  function formatKm(km) {
    return Number.isFinite(km) ? Math.round(km).toLocaleString("pt-BR") + " km" : "—";
  }

  function formatScore(score) {
    return Number(score).toLocaleString("pt-BR", {
      minimumFractionDigits: Number.isInteger(score) ? 0 : 1,
      maximumFractionDigits: 1
    });
  }

  function imageUrl(item) {
    if (item.imagem) return item.imagem;
    return "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(item.imagemArquivo) + "?width=1600";
  }

  function imageSourceUrl(item) {
    if (item.fonteImagem) return item.fonteImagem;
    return "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(item.imagemArquivo);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add("show");
    toastTimer = window.setTimeout(() => el.toast.classList.remove("show"), 3000);
  }

  function readSetupInputs() {
    setupNames = Array.from(el.playerSetupList.querySelectorAll("input")).map((input) => input.value);
  }

  function renderPlayerSetup() {
    el.playerSetupList.innerHTML = "";

    setupNames.forEach((name, index) => {
      const color = PLAYER_COLORS[index];
      const row = document.createElement("div");
      row.className = "player-setup-row";

      const swatch = document.createElement("span");
      swatch.className = "player-color-swatch";
      swatch.style.backgroundColor = color.value;
      swatch.title = color.name;
      if (color.name === "Preto" || color.name === "Branco") swatch.classList.add("outlined");

      const field = document.createElement("label");
      field.className = "player-name-field";

      const label = document.createElement("span");
      label.textContent = "Jogador " + (index + 1) + " · " + color.name;

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 24;
      input.value = name;
      input.placeholder = "Nome do jogador";
      input.autocomplete = "off";
      input.setAttribute("aria-label", "Nome do jogador " + (index + 1));

      field.append(label, input);

      const remove = document.createElement("button");
      remove.className = "remove-player";
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remover jogador " + (index + 1));
      remove.disabled = setupNames.length === 1;
      remove.addEventListener("click", () => {
        readSetupInputs();
        setupNames.splice(index, 1);
        renderPlayerSetup();
      });

      row.append(swatch, field, remove);
      el.playerSetupList.appendChild(row);
    });

    el.btnAddPlayer.disabled = setupNames.length >= PLAYER_COLORS.length;
    el.btnStartGame.disabled = locations.length === 0;
  }

  function addPlayerSlot() {
    if (setupNames.length >= PLAYER_COLORS.length) return;
    readSetupInputs();
    setupNames.push("");
    renderPlayerSetup();
    const inputs = el.playerSetupList.querySelectorAll("input");
    const last = inputs[inputs.length - 1];
    if (last) last.focus();
  }

  function startGame() {
    if (!locations.length) return;
    readSetupInputs();

    players = setupNames.map((name, index) => ({
      id: "player-" + (index + 1),
      name: name.trim() || "Jogador " + (index + 1),
      color: PLAYER_COLORS[index],
      score: 0
    }));

    renderScoreboard();
    el.setupScreen.hidden = true;
    startRound(pickNext());
    showCard();
  }

  function updatePointsLayer() {
    world
      .pointsData(visiblePoints)
      .pointLat((point) => point.lat)
      .pointLng((point) => point.lng)
      .pointAltitude((point) => point.altitude)
      .pointRadius((point) => point.radius)
      .pointColor((point) => point.color);
  }

  function updatePathLayer() {
    world
      .pathsData(revealPaths)
      .pathPoints((path) => path.points)
      .pathPointLat((point) => point.lat)
      .pathPointLng((point) => point.lng)
      .pathColor((path) => path.color)
      .pathStroke(() => 1.7)
      .pathDashLength(() => 0)
      .pathDashGap(() => 0);
  }

  function clearRoundState() {
    currentPlayerIndex = 0;
    roundGuesses = [];
    pendingGuess = null;
    visiblePoints = [];
    revealPaths = [];
    solved = false;

    updatePointsLayer();
    updatePathLayer();

    el.revealBox.hidden = true;
    el.roundResults.innerHTML = "";
    el.btnConfirm.hidden = false;
    el.btnConfirm.disabled = true;
    el.btnNext.hidden = true;
    el.btnSkipCard.disabled = false;
    updateTurnUI();
  }

  function updateTurnUI() {
    if (!players.length || solved) return;
    const player = players[currentPlayerIndex];
    el.currentPlayerDot.style.backgroundColor = player.color.value;
    el.currentPlayerDot.classList.toggle("outlined", player.color.name === "Preto" || player.color.name === "Branco");
    el.currentPlayerName.textContent = player.name;
    el.turnCounter.textContent = (currentPlayerIndex + 1) + "/" + players.length;
    el.guessStatus.textContent = "Gire o globo e marque o palpite de " + player.name + ". A distância só será revelada depois que todos jogarem.";
  }

  function setPendingGuess(lat, lng) {
    const player = players[currentPlayerIndex];
    pendingGuess = { lat, lng };
    visiblePoints = [{
      lat,
      lng,
      radius: 0.38,
      altitude: 0.035,
      color: player.color.value
    }];
    revealPaths = [];
    updatePathLayer();
    updatePointsLayer();

    el.btnConfirm.disabled = false;
    el.guessStatus.textContent = "Ponto marcado para " + player.name + ". Você pode trocar o ponto antes de confirmar.";
  }

  function confirmGuess() {
    if (!current || solved || !pendingGuess || !players.length) return;

    const player = players[currentPlayerIndex];
    const distance = haversineKm(pendingGuess.lat, pendingGuess.lng, current.lat, current.lng);
    const points = scoreForDistance(distance);

    roundGuesses.push({
      playerIndex: currentPlayerIndex,
      lat: pendingGuess.lat,
      lng: pendingGuess.lng,
      distance,
      points
    });

    pendingGuess = null;
    el.btnConfirm.disabled = true;
    el.btnSkipCard.disabled = true;

    if (currentPlayerIndex < players.length - 1) {
      const previousName = player.name;
      currentPlayerIndex += 1;
      visiblePoints = [];
      updatePointsLayer();
      world.pointOfView({ lat: 12, lng: -18, altitude: 2.25 }, 350);
      updateTurnUI();
      showToast("Palpite de " + previousName + " registrado. Agora é a vez de " + players[currentPlayerIndex].name + ".");
      return;
    }

    revealRound();
  }

  function revealRound() {
    solved = true;
    pendingGuess = null;

    roundGuesses.forEach((guess) => {
      const player = players[guess.playerIndex];
      player.score = Math.round((player.score + guess.points) * 10) / 10;
    });

    visiblePoints = roundGuesses.map((guess) => {
      const player = players[guess.playerIndex];
      return {
        lat: guess.lat,
        lng: guess.lng,
        radius: 0.36,
        altitude: 0.035,
        color: player.color.value
      };
    });

    visiblePoints.push({
      lat: current.lat,
      lng: current.lng,
      radius: 0.5,
      altitude: 0.055,
      color: "#f2a85f"
    });

    revealPaths = roundGuesses.map((guess) => ({
      color: players[guess.playerIndex].color.value,
      points: [
        { lat: guess.lat, lng: guess.lng },
        { lat: current.lat, lng: current.lng }
      ]
    }));

    updatePointsLayer();
    updatePathLayer();

    el.currentPlayerDot.style.backgroundColor = "#f2a85f";
    el.currentPlayerDot.classList.remove("outlined");
    el.currentPlayerName.textContent = "Resultado da rodada";
    el.turnCounter.textContent = players.length + "/" + players.length;
    el.guessStatus.textContent = "Todos os palpites foram registrados. Agora a resposta, as distâncias e os pontos estão liberados.";

    el.revealTitle.textContent = current.resposta;
    el.revealText.textContent = current.pais + " · " + current.revelacao;
    renderRoundResults();
    el.revealBox.hidden = false;

    el.btnConfirm.hidden = true;
    el.btnNext.hidden = false;

    renderScoreboard();
    world.pointOfView({ lat: current.lat, lng: current.lng, altitude: 1.72 }, 850);

    if (roundGuesses.some((guess) => guess.points === 10)) celebrate();
    showToast("Rodada concluída. Pontos adicionados ao placar.");
  }

  function renderRoundResults() {
    el.roundResults.innerHTML = "";

    const ordered = roundGuesses.slice().sort((a, b) => b.points - a.points);
    ordered.forEach((guess) => {
      const player = players[guess.playerIndex];
      const row = document.createElement("div");
      row.className = "round-result-row";

      const identity = document.createElement("div");
      identity.className = "score-player";

      const dot = document.createElement("span");
      dot.className = "score-dot";
      dot.style.backgroundColor = player.color.value;
      if (player.color.name === "Preto" || player.color.name === "Branco") dot.classList.add("outlined");

      const name = document.createElement("span");
      name.textContent = player.name;
      identity.append(dot, name);

      const metrics = document.createElement("div");
      metrics.className = "round-result-metrics";

      const distance = document.createElement("span");
      distance.textContent = formatKm(guess.distance);

      const points = document.createElement("strong");
      points.textContent = "+" + formatScore(guess.points) + " pts";

      metrics.append(distance, points);
      row.append(identity, metrics);
      el.roundResults.appendChild(row);
    });
  }

  function renderScoreboard() {
    el.scoreboardList.innerHTML = "";
    if (!players.length) return;

    const ordered = players.slice().sort((a, b) => b.score - a.score);
    ordered.forEach((player, index) => {
      const row = document.createElement("div");
      row.className = "score-row";

      const position = document.createElement("span");
      position.className = "score-position";
      position.textContent = String(index + 1);

      const identity = document.createElement("div");
      identity.className = "score-player";

      const dot = document.createElement("span");
      dot.className = "score-dot";
      dot.style.backgroundColor = player.color.value;
      if (player.color.name === "Preto" || player.color.name === "Branco") dot.classList.add("outlined");

      const name = document.createElement("span");
      name.textContent = player.name;

      identity.append(dot, name);

      const score = document.createElement("strong");
      score.className = "score-value";
      score.textContent = formatScore(player.score) + " pts";

      row.append(position, identity, score);
      el.scoreboardList.appendChild(row);
    });
  }

  function openScoreboard() {
    if (!players.length) return;
    renderScoreboard();
    el.scoreBackdrop.hidden = false;
    el.scoreDrawer.hidden = false;
    window.requestAnimationFrame(() => el.btnCloseScore.focus({ preventScroll: true }));
  }

  function closeScoreboard() {
    el.scoreBackdrop.hidden = true;
    el.scoreDrawer.hidden = true;
  }

  function resetScores() {
    if (!players.length) return;
    const hasScore = players.some((player) => player.score !== 0);
    if (hasScore && !window.confirm("Zerar a pontuação de todos os jogadores?")) return;

    players.forEach((player) => {
      player.score = 0;
    });
    renderScoreboard();
    showToast("Pontuação zerada.");
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
    const label = "Carta " + roundNumber + " de " + locations.length;
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
    loadCardImage(current);

    el.btnToGlobe.disabled = false;
    world.pointOfView({ lat: 12, lng: -18, altitude: 2.25 }, 600);
  }

  function showCard() {
    if (!current) return;
    el.globeScreen.hidden = true;
    el.clueScreen.hidden = false;
    el.btnSkipCard.disabled = roundGuesses.length > 0 || solved;
    window.requestAnimationFrame(() => el.btnToGlobe.focus({ preventScroll: true }));
  }

  function showGlobe() {
    if (!current) return;
    el.clueScreen.hidden = true;
    el.globeScreen.hidden = false;
    if (!solved) updateTurnUI();
    window.requestAnimationFrame(() => {
      resizeGlobe();
      el.btnBackCard.focus({ preventScroll: true });
    });
  }

  function skipRound() {
    if (roundGuesses.length > 0 || solved) {
      showToast("A carta não pode ser trocada depois que os palpites começaram.");
      return;
    }
    startRound(pickNext());
    showCard();
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
        id: item.id || "carta-" + (index + 1),
        lat: Number(item.lat),
        lng: Number(item.lng ?? item.lon)
      };

      if (ids.has(normalized.id)) throw new Error("ID duplicado: " + normalized.id);
      if (!Number.isFinite(normalized.lat) || normalized.lat < -90 || normalized.lat > 90) {
        throw new Error("Latitude inválida em " + normalized.id);
      }
      if (!Number.isFinite(normalized.lng) || normalized.lng < -180 || normalized.lng > 180) {
        throw new Error("Longitude inválida em " + normalized.id);
      }
      if (!normalized.nome || !normalized.resposta || !normalized.revelacao || !normalized.imagemArquivo || !normalized.imagemAlt) {
        throw new Error("Carta incompleta: " + normalized.id);
      }

      ids.add(normalized.id);
      return normalized;
    });
  }

  async function init() {
    renderPlayerSetup();

    try {
      const response = await fetch("./locations.json?v=8", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status + " ao carregar locations.json");
      const rawLocations = await response.json();
      if (!Array.isArray(rawLocations) || rawLocations.length === 0) {
        throw new Error("A coleção de cartas está vazia ou inválida.");
      }

      locations = normalizeLocations(rawLocations);
      refillBag();
      updatePointsLayer();
      updatePathLayer();

      el.setupStatus.textContent = locations.length + " cartas prontas. Adicione os jogadores e comece.";
      renderPlayerSetup();
    } catch (error) {
      console.error(error);
      el.setupStatus.textContent = "Não foi possível carregar as cartas. Recarregue a página.";
      el.btnStartGame.disabled = true;
    }
  }

  init();
})();
