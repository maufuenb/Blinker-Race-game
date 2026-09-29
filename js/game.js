(() => {
      const canvas = document.querySelector("#game");
      const ctx = canvas.getContext("2d");
      const scoreEl = document.querySelector("#score");
      const bestEl = document.querySelector("#best");
      const speedEl = document.querySelector("#speed");
      const actionButton = document.querySelector("#action");
      const W = canvas.width;
      const H = canvas.height;
      const colors = { lcd: "#b9cf8a", road: "#809968", dark: "#405633", ink: "#263923", light: "#e2efb8" };
      const lanes = [101, 160, 219];
      const TRAFFIC_CAR_HEIGHT = 48;
      const PLAYER_CLEARANCE = 96;
      const player = { lane: 1, y: 356, width: 30, height: 48 };
      let traffic = [];
      let mode = "ready";
      let score = 0;
      let best = Number(localStorage.getItem("rush-hour-best") || 0);
      let speed = 1;
      let elapsed = 0;
      let spawnClock = 0;
      let roadOffset = 0;
      let lastTime = 0;
      let animationId;
      let held = 0;
      bestEl.textContent = String(best).padStart(5, "0");

      // Dibuja un rectangulo ajustado a la cuadricula pixelada del juego.
      function rect(x, y, width, height, color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
      }

      // Construye un auto con bloques y agrega el intermitente a los rivales.
      function drawCar(x, y, color, isPlayer = false, signalDirection = 0, signalOn = false) {
        const left = x - 15;
        rect(left + 5, y, 20, 4, colors.ink);
        rect(left + 2, y + 4, 26, 9, color);
        rect(left, y + 12, 30, 25, color);
        rect(left + 3, y + 37, 24, 7, color);
        rect(left + 5, y + 8, 20, 10, isPlayer ? colors.dark : colors.ink);
        rect(left + 7, y + 10, 16, 6, isPlayer ? "#a9c47a" : "#71835c");
        rect(left - 2, y + 12, 4, 9, colors.ink);
        rect(left + 28, y + 12, 4, 9, colors.ink);
        rect(left - 2, y + 32, 4, 9, colors.ink);
        rect(left + 28, y + 32, 4, 9, colors.ink);
        if (isPlayer) {
          rect(left + 4, y + 3, 6, 3, colors.light);
          rect(left + 20, y + 3, 6, 3, colors.light);
        } else {
          rect(left + 4, y + 38, 6, 3, "#d9cf81");
          rect(left + 20, y + 38, 6, 3, "#d9cf81");
          if (signalDirection !== 0) {
            const signalX = signalDirection < 0 ? left + 1 : left + 24;
            rect(signalX, y + 31, 5, 5, signalOn ? "#f1ad45" : "#8b7040");
          }
        }
      }

      // Dibuja la carretera y desplaza sus marcas para simular que avanzamos.
      function drawRoad() {
        rect(0, 0, W, H, colors.lcd);
        rect(0, 0, 27, H, colors.road);
        rect(W - 27, 0, 27, H, colors.road);
        for (let y = -24 + roadOffset % 30; y < H; y += 30) {
          rect(24, y, 7, 15, colors.dark);
          rect(W - 31, y, 7, 15, colors.dark);
        }
        rect(31, 0, 2, H, colors.dark);
        rect(W - 33, 0, 2, H, colors.dark);
        for (const x of [130, 190]) {
          for (let y = -32 + roadOffset % 44; y < H; y += 44) rect(x, y, 3, 22, colors.light);
        }
        rect(43, 0, 2, H, "#91a875");
        rect(W - 45, 0, 2, H, "#91a875");
      }

      // Muestra los mensajes de inicio, pausa o fin sobre la pista.
      function drawOverlay(title, subtitle, prompt) {
        rect(34, 153, 252, 116, colors.lcd);
        rect(34, 153, 252, 3, colors.dark);
        rect(34, 266, 252, 3, colors.dark);
        ctx.textAlign = "center";
        ctx.fillStyle = colors.ink;
        ctx.font = "bold 23px monospace";
        ctx.fillText(title, W / 2, 193);
        ctx.font = "bold 10px monospace";
        ctx.fillText(subtitle, W / 2, 218);
        ctx.fillStyle = colors.dark;
        ctx.font = "bold 9px monospace";
        ctx.fillText(prompt, W / 2, 247);
      }

      // Redibuja la pista, los autos y la pantalla correspondiente al estado actual.
      function render() {
        drawRoad();
        const signalOn = Math.floor(performance.now() / 250) % 2 === 0;
        for (const car of traffic) {
          drawCar(lanes[car.lane], car.y, car.color, false, car.signalDirection, car.signalTimer > 0 && signalOn);
        }
        drawCar(lanes[player.lane], player.y, colors.ink, true);
        if (mode === "ready") drawOverlay("RUSH HOUR", "EL TRÁFICO NO DESCANSA", "PRESIONA INICIAR O ESPACIO");
        if (mode === "over") drawOverlay("¡CHOQUE!", `PUNTAJE ${String(score).padStart(5, "0")}`, "PRESIONA INICIAR PARA REINTENTAR");
        if (mode === "paused") drawOverlay("EN PAUSA", "TOMA EL CONTROL", "PRESIONA P PARA CONTINUAR");
      }

      // Refresca el puntaje y la velocidad que aparecen sobre el juego.
      function updateHud() {
        scoreEl.textContent = String(score).padStart(5, "0");
        speedEl.textContent = String(Math.min(99, Math.floor(speed * 12))).padStart(2, "0");
      }

      // Reinicia el estado de la partida y prepara al jugador en el carril central.
      function startGame() {
        traffic = [];
        score = 0;
        elapsed = 0;
        spawnClock = 0;
        speed = 1;
        player.lane = 1;
        held = 0;
        mode = "playing";
        actionButton.textContent = "PAUSAR";
        updateHud();
      }

      // Termina la partida y guarda el nuevo récord si supera al anterior.
      function crash() {
        mode = "over";
        actionButton.textContent = "REINTENTAR";
        if (score > best) {
          best = score;
          localStorage.setItem("rush-hour-best", String(best));
          bestEl.textContent = String(best).padStart(5, "0");
        }
      }

      // Mueve al jugador un carril sin permitir que salga de la carretera.
      function move(direction) {
        if (mode !== "playing") return;
        player.lane = Math.max(0, Math.min(2, player.lane + direction));
      }

      // Evita cambios hacia carriles ocupados o demasiado cerca del jugador.
      function canChangeLane(car, nextLane) {
        const laneBlocked = traffic.some(other => other !== car && other.lane === nextLane && Math.abs(other.y - car.y) < 80);
        const playerInWay = nextLane === player.lane &&
          car.y < player.y + player.height + PLAYER_CLEARANCE &&
          car.y + TRAFFIC_CAR_HEIGHT > player.y - PLAYER_CLEARANCE;
        return !laneBlocked && !playerInWay;
      }

      // Avanza la simulación, crea tráfico, resuelve maniobras y detecta choques.
      function tick(time) {
        const dt = Math.min((time - lastTime) / 1000 || 0, 0.04);
        lastTime = time;
        if (mode === "playing") {
          // La velocidad y el puntaje dependen del tiempo transcurrido.
          elapsed += dt;
          speed = 1 + elapsed * 0.045;
          score = Math.floor(elapsed * 10);
          roadOffset += dt * (110 + speed * 20);
          spawnClock += dt;
          if (spawnClock > Math.max(0.42, 1.15 - elapsed * 0.012)) {
            spawnClock = 0;
            const lane = Math.floor(Math.random() * 3);
            // No crea otro auto en un carril si hay uno demasiado cerca de la entrada.
            const blocked = traffic.some(car => car.lane === lane && car.y < 95);
            if (!blocked) {
              const carColors = ["#526b45", "#66784e", "#354d37"];
              traffic.push({ lane, y: -55, laneChangeTimer: 0.8 + Math.random() * 1.8, signalTimer: 0, signalDirection: 0, targetLane: null, color: carColors[Math.floor(Math.random() * carColors.length)] });
            }
          }
          for (const car of traffic) {
            car.y += dt * (145 + speed * 29);
            if (car.signalTimer > 0) {
              car.signalTimer = Math.max(0, car.signalTimer - dt);
              if (car.signalTimer === 0) {
                // Tras un segundo de intermitente, confirma que el cambio siga siendo seguro.
                if (canChangeLane(car, car.targetLane)) car.lane = car.targetLane;
                car.targetLane = null;
                car.signalDirection = 0;
              }
              continue;
            }
            car.laneChangeTimer -= dt;
            if (car.laneChangeTimer <= 0) {
              car.laneChangeTimer = 0.8 + Math.random() * 1.8;
              // Cada rival solo intenta cambiar algunas veces, no en todos sus turnos.
              if (Math.random() < 0.35) {
                const adjacentLanes = [];
                if (car.lane > 0) adjacentLanes.push(car.lane - 1);
                if (car.lane < lanes.length - 1) adjacentLanes.push(car.lane + 1);
                const nextLane = adjacentLanes[Math.floor(Math.random() * adjacentLanes.length)];
                if (canChangeLane(car, nextLane)) {
                  car.targetLane = nextLane;
                  car.signalDirection = Math.sign(nextLane - car.lane);
                  car.signalTimer = 1;
                }
              }
            }
          }
          traffic = traffic.filter(car => car.y < H + 50);
          // El choque ocurre cuando los autos comparten carril y sus posiciones se cruzan.
          if (traffic.some(car => car.lane === player.lane && car.y + 42 > player.y + 5 && car.y < player.y + 43)) crash();
          updateHud();
        }
        render();
        animationId = requestAnimationFrame(tick);
      }

      // Alterna entre pausa y reanudacion cuando la partida ya comenzo.
      function togglePause() {
        if (mode === "playing") {
          mode = "paused";
          actionButton.textContent = "CONTINUAR";
        } else if (mode === "paused") {
          mode = "playing";
          actionButton.textContent = "PAUSAR";
        }
      }

      // Traduce las teclas a movimientos, inicio y pausa.
      document.addEventListener("keydown", event => {
        if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
        if (event.repeat) return;
        if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") move(-1);
        if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") move(1);
        if (event.key.toLowerCase() === "p") togglePause();
        if (event.key === " " && mode === "playing") togglePause();
        else if ((event.key === " " || event.key === "Enter") && mode !== "playing") startGame();
      });

      // Conecta los botones tactiles y los toques sobre cada mitad de la pantalla.
      actionButton.addEventListener("click", () => {
        if (mode === "playing" || mode === "paused") togglePause();
        else startGame();
      });
      document.querySelector("#left").addEventListener("pointerdown", () => move(-1));
      document.querySelector("#right").addEventListener("pointerdown", () => move(1));
      canvas.addEventListener("pointerdown", event => {
        const bounds = canvas.getBoundingClientRect();
        move(event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
      });

      render();
      animationId = requestAnimationFrame(tick);
      window.addEventListener("pagehide", () => cancelAnimationFrame(animationId));
    })();
