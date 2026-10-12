const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const cookieParser = require("cookie-parser");
const app = express();
const port = 3000;

app.use(cookieParser());
app.use(express.json());

// Für Tests kann die Ablaufzeit über die Umgebungsvariable verkürzt werden.
const GAME_TTL_MS = Number(process.env.GAME_TTL_MS) || 1000 * 60 * 60;
const CLEANUP_INTERVAL_MS = 1000 * 60;
const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || "http://localhost:5173";

const BOARD_SIZE = 10;
const FLEET = [
  { name: "Träger", size: 5 },
  { name: "Schlachtschiff", size: 4 },
  { name: "Kreuzer", size: 3 },
  { name: "U-Boot", size: 3 },
  { name: "Zerstörer", size: 2 },
];

// Auf false wechselt der Zug nach jedem Schuss, auf true darf man nach einem Treffer nochmals.
const EXTRA_TURN_ON_HIT = false;

const PHASES = {
  WAITING_FOR_PLAYER: "WAITING_FOR_PLAYER",
  PLACING_SHIPS: "PLACING_SHIPS",
  IN_PROGRESS: "IN_PROGRESS",
  FINISHED: "FINISHED",
};

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_BASE_URL, credentials: true },
});

const games = [];

function isExpired(game) {
  return game.expiresAt <= Date.now();
}

function removeExpiredGames() {
  for (let i = games.length - 1; i >= 0; i--) {
    if (isExpired(games[i])) {
      const game = games[i];
      io.to(game.gameSessionId).emit("game:expired", {
        gameSessionId: game.gameSessionId,
      });
      games.splice(i, 1);
    }
  }
}

function findGame(gameSessionId) {
  return games.find((game) => game.gameSessionId === gameSessionId);
}

function findActiveGameOfPlayer(sessionId) {
  if (!sessionId) {
    return undefined;
  }
  return games.find(
    (game) =>
      !isExpired(game) &&
      (game.firstPlayerId === sessionId || game.secondPlayerId === sessionId),
  );
}

function isPlayer(game, sessionId) {
  return Boolean(
    sessionId &&
    (game.firstPlayerId === sessionId || game.secondPlayerId === sessionId),
  );
}

function roleOf(game, sessionId) {
  if (!sessionId) {
    return null;
  }
  if (game.firstPlayerId === sessionId) {
    return "first";
  }
  return game.secondPlayerId === sessionId ? "second" : null;
}

function opponentOf(game, sessionId) {
  return game.firstPlayerId === sessionId
    ? game.secondPlayerId
    : game.firstPlayerId;
}

function resolveSessionId(cookie) {
  return cookie || uuidv4();
}

function setSessionCookie(res, sessionId) {
  res.cookie("SESSION_ID", sessionId, {
    httpOnly: true,
    maxAge: GAME_TTL_MS,
    sameSite: "lax",
    secure: false /*Only in Development*/,
  });
}

/**
 * Socket.IO hat keinen cookie-parser, darum lesen wir den Cookie-Header selbst.
 *
 * @returns {Object<string, string>}
 */
function parseCookies(header) {
  const cookies = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}

function inviteUrl(gameSessionId) {
  return `${CLIENT_BASE_URL}/join/${gameSessionId}`;
}

/**
 * Leitet die Phase aus dem Zustand ab. Sobald beide Flotten stehen, beginnt
 * das Spiel und der erste Spieler ist am Zug.
 */
function updatePhase(game) {
  if (game.winner) {
    game.phase = PHASES.FINISHED;
    return;
  }
  if (!game.secondPlayerId) {
    game.phase = PHASES.WAITING_FOR_PLAYER;
    return;
  }
  const bothPlaced =
    Boolean(game.ships[game.firstPlayerId]) &&
    Boolean(game.ships[game.secondPlayerId]);
  if (!bothPlaced) {
    game.phase = PHASES.PLACING_SHIPS;
    return;
  }
  game.phase = PHASES.IN_PROGRESS;
  if (!game.turn) {
    game.turn = game.firstPlayerId;
  }
}

function publicGameInfo(game) {
  return {
    gameSessionId: game.gameSessionId,
    phase: game.phase,
    playerCount: game.secondPlayerId ? 2 : 1,
    joinable: !game.secondPlayerId,
    turn: roleOf(game, game.turn),
    winner: roleOf(game, game.winner),
    createdAt: new Date(game.createdAt).toISOString(),
    expiresAt: new Date(game.expiresAt).toISOString(),
    expiresInMs: Math.max(0, game.expiresAt - Date.now()),
  };
}

/**
 * Spielstand aus Sicht eines Spielers: eigene Schiffe, eigene Schüsse und die
 * Schüsse des Gegners. Die gegnerische Flotte wird erst nach Spielende gezeigt.
 */
function playerStateFor(game, sessionId) {
  const opponentId = opponentOf(game, sessionId);
  return {
    ...publicGameInfo(game),
    yourRole: roleOf(game, sessionId),
    yourTurn: game.turn === sessionId,
    yourShips: game.ships[sessionId] || null,
    youArePlaced: Boolean(game.ships[sessionId]),
    opponentPlaced: Boolean(opponentId && game.ships[opponentId]),
    yourShots: game.shots[sessionId] || [],
    opponentShots: (opponentId && game.shots[opponentId]) || [],
    opponentShips: game.winner && opponentId ? game.ships[opponentId] : null,
    fleet: FLEET,
    boardSize: BOARD_SIZE,
  };
}

function startGame(cookie) {
  const userSessionId = resolveSessionId(cookie);
  const gameSessionId = uuidv4();
  const createdAt = Date.now();
  const game = {
    gameSessionId: gameSessionId,
    firstPlayerId: userSessionId,
    secondPlayerId: null,
    createdAt: createdAt,
    expiresAt: createdAt + GAME_TTL_MS,
    phase: PHASES.WAITING_FOR_PLAYER,
    ships: {},
    shots: { [userSessionId]: [] },
    turn: null,
    winner: null,
  };
  games.push(game);
  return { userSessionId: userSessionId, game: game };
}

/**
 * Lädt das Spiel aus der URL und stellt sicher, dass es noch nicht abgelaufen ist.
 */
function requireGame(req, res, next) {
  const game = findGame(req.params.gameSessionId);
  if (!game) {
    return res.status(404).send({ error: "Dieses Spiel existiert nicht" });
  }
  if (isExpired(game)) {
    return res.status(410).send({ error: "Dieses Spiel ist abgelaufen" });
  }
  req.game = game;
  next();
}

/**
 * Stellt sicher, dass der Aufrufer über seine Session einer der beiden Spieler ist.
 */
function requirePlayer(req, res, next) {
  const sessionId = req.cookies.SESSION_ID;
  if (!isPlayer(req.game, sessionId)) {
    return res
      .status(403)
      .send({ error: "Sie sind kein Spieler dieser Partie" });
  }
  req.playerSessionId = sessionId;
  req.opponentSessionId = opponentOf(req.game, sessionId);
  next();
}

function shipCells(ship) {
  const cells = [];
  for (let i = 0; i < ship.size; i++) {
    cells.push(
      ship.orientation === "horizontal"
        ? { x: ship.x + i, y: ship.y }
        : { x: ship.x, y: ship.y + i },
    );
  }
  return cells;
}

function shipAt(ships, x, y) {
  return ships.find((ship) =>
    shipCells(ship).some((cell) => cell.x === x && cell.y === y),
  );
}

/**
 * Prüft die Flotte eines Spielers und gibt eine Fehlermeldung zurück, oder null wenn alles passt.
 */
function validateShips(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) {
    return `Es müssen genau ${FLEET.length} Schiffe platziert werden`;
  }

  for (const ship of ships) {
    if (!ship || typeof ship !== "object") {
      return "Jedes Schiff muss ein Objekt mit x, y, size und orientation sein";
    }
    if (
      !Number.isInteger(ship.x) ||
      !Number.isInteger(ship.y) ||
      !Number.isInteger(ship.size)
    ) {
      return "x, y und size müssen ganze Zahlen sein";
    }
    if (ship.orientation !== "horizontal" && ship.orientation !== "vertical") {
      return "orientation muss 'horizontal' oder 'vertical' sein";
    }
  }

  const expectedSizes = FLEET.map((ship) => ship.size).sort((a, b) => a - b);
  const actualSizes = ships.map((ship) => ship.size).sort((a, b) => a - b);
  if (expectedSizes.join(",") !== actualSizes.join(",")) {
    return `Die Flotte muss aus Schiffen der Längen ${expectedSizes.join(", ")} bestehen`;
  }

  const occupied = new Set();
  for (const ship of ships) {
    for (const cell of shipCells(ship)) {
      if (
        cell.x < 0 ||
        cell.y < 0 ||
        cell.x >= BOARD_SIZE ||
        cell.y >= BOARD_SIZE
      ) {
        return `Alle Schiffe müssen vollständig auf dem ${BOARD_SIZE}x${BOARD_SIZE}-Spielfeld liegen`;
      }
      const key = `${cell.x},${cell.y}`;
      if (occupied.has(key)) {
        return "Schiffe dürfen sich nicht überlappen";
      }
      occupied.add(key);
    }
  }

  return null;
}

/**
 * Wertet einen Schuss aus: Treffer, versenktes Schiff, Zugwechsel und Sieg.
 */
function registerShot(game, shooterId, x, y) {
  const targetId = opponentOf(game, shooterId);
  const targetShips = game.ships[targetId];
  const ship = shipAt(targetShips, x, y);

  const shot = { x: x, y: y, result: "miss", sunk: null };
  if (ship) {
    ship.hits += 1;
    shot.result = "hit";
    if (ship.hits >= ship.size) {
      shot.sunk = ship.size;
    }
  }
  game.shots[shooterId].push(shot);

  if (targetShips.every((target) => target.hits >= target.size)) {
    game.winner = shooterId;
    game.turn = null;
    game.phase = PHASES.FINISHED;
  } else if (shot.result !== "hit" || !EXTRA_TURN_ON_HIT) {
    game.turn = targetId;
  }

  return shot;
}

app.post("/games/start", (req, res) => {
  removeExpiredGames();
  let cookie = req.cookies.SESSION_ID;
  if (findActiveGameOfPlayer(cookie)) {
    return res
      .status(409)
      .send({ error: "Beenden Sie zuerst das andere Spiel" });
  }
  let { userSessionId, game } = startGame(cookie);
  setSessionCookie(res, userSessionId);
  res.send({
    gameSessionId: game.gameSessionId,
    inviteUrl: inviteUrl(game.gameSessionId),
    expiresAt: new Date(game.expiresAt).toISOString(),
    expiresInMs: game.expiresAt - Date.now(),
    phase: game.phase,
    fleet: FLEET,
    boardSize: BOARD_SIZE,
  });
});

/**
 * Öffentliche Infos zu einem Spiel, damit die Einladungsseite anzeigen kann,
 * ob man noch beitreten kann und wann das Spiel abläuft.
 */
app.get("/games/:gameSessionId", requireGame, (req, res) => {
  res.send(publicGameInfo(req.game));
});

/**
 * Beitritt über den Einladungslink: der zweite Spieler erhält eine Session
 * und danach können beide Spieler ihre Schiffe platzieren.
 */
app.post("/games/:gameSessionId/join", requireGame, (req, res) => {
  removeExpiredGames();
  const game = req.game;
  const cookie = req.cookies.SESSION_ID;

  if (isPlayer(game, cookie)) {
    setSessionCookie(res, cookie);
    return res.send({
      gameSessionId: game.gameSessionId,
      alreadyJoined: true,
      phase: game.phase,
      expiresAt: new Date(game.expiresAt).toISOString(),
      fleet: FLEET,
      boardSize: BOARD_SIZE,
    });
  }
  if (game.secondPlayerId) {
    return res.status(409).send({ error: "Dieses Spiel ist bereits voll" });
  }
  if (findActiveGameOfPlayer(cookie)) {
    return res
      .status(409)
      .send({ error: "Beenden Sie zuerst das andere Spiel" });
  }

  const userSessionId = resolveSessionId(cookie);
  game.secondPlayerId = userSessionId;
  game.shots[userSessionId] = [];
  updatePhase(game);

  io.to(game.gameSessionId).emit("game:player-joined", publicGameInfo(game));

  setSessionCookie(res, userSessionId);
  res.send({
    gameSessionId: game.gameSessionId,
    alreadyJoined: false,
    phase: game.phase,
    expiresAt: new Date(game.expiresAt).toISOString(),
    expiresInMs: game.expiresAt - Date.now(),
    fleet: FLEET,
    boardSize: BOARD_SIZE,
  });
});

/**
 * Aktueller Stand aus Sicht des anfragenden Spielers.
 */
app.get(
  "/games/:gameSessionId/state",
  requireGame,
  requirePlayer,
  (req, res) => {
    res.send(playerStateFor(req.game, req.playerSessionId));
  },
);

/**
 * Schiffe platzieren. Beide Spieler platzieren ihre eigene Flotte genau einmal.
 */
app.post(
  "/games/:gameSessionId/ships",
  requireGame,
  requirePlayer,
  (req, res) => {
    const game = req.game;
    if (game.ships[req.playerSessionId]) {
      return res
        .status(409)
        .send({ error: "Sie haben Ihre Schiffe bereits platziert" });
    }

    const error = validateShips(req.body && req.body.ships);
    if (error) {
      return res.status(400).send({ error: error });
    }

    game.ships[req.playerSessionId] = req.body.ships.map((ship) => ({
      x: ship.x,
      y: ship.y,
      size: ship.size,
      orientation: ship.orientation,
      hits: 0,
    }));

    const phaseBefore = game.phase;
    updatePhase(game);
    if (
      phaseBefore !== PHASES.IN_PROGRESS &&
      game.phase === PHASES.IN_PROGRESS
    ) {
      // Beide Flotten stehen: das Spiel beginnt, der erste Spieler ist am Zug.
      io.to(game.gameSessionId).emit("game:started", publicGameInfo(game));
    } else {
      io.to(game.gameSessionId).emit("game:ships-placed", {
        ...publicGameInfo(game),
        by: roleOf(game, req.playerSessionId),
      });
    }

    res.send({
      phase: game.phase,
      turn: roleOf(game, game.turn),
      yourShips: game.ships[req.playerSessionId],
      opponentPlaced: Boolean(
        req.opponentSessionId && game.ships[req.opponentSessionId],
      ),
      waitingForOpponent: game.phase !== PHASES.IN_PROGRESS,
      expiresAt: new Date(game.expiresAt).toISOString(),
    });
  },
);

/**
 * Nur Spieler einer noch laufenden Partie dürfen sich auf den Socket verbinden.
 * Die Partie wird über `auth.gameSessionId` gewählt, der Spieler über das Session-Cookie.
 */
io.use((socket, next) => {
  const gameSessionId =
    socket.handshake.auth && socket.handshake.auth.gameSessionId;
  const sessionId = parseCookies(socket.handshake.headers.cookie).SESSION_ID;
  const game = findGame(gameSessionId);

  if (!game) {
    return next(new Error("Dieses Spiel existiert nicht"));
  }
  if (isExpired(game)) {
    return next(new Error("Dieses Spiel ist abgelaufen"));
  }
  if (!isPlayer(game, sessionId)) {
    return next(new Error("Sie sind kein Spieler dieser Partie"));
  }

  socket.data.gameSessionId = gameSessionId;
  socket.data.sessionId = sessionId;
  next();
});

/**
 * Meldet einen Regelverstoss an den Aufrufer, per Acknowledgement und als Event.
 */
function fail(socket, ack, message) {
  if (typeof ack === "function") {
    ack({ error: message });
  }
  socket.emit("game:error", { error: message });
}

/**
 * Holt das Spiel des Sockets, oder null wenn es inzwischen abgelaufen ist.
 */
function gameOfSocket(socket) {
  const game = findGame(socket.data.gameSessionId);
  if (!game || isExpired(game)) {
    return null;
  }
  return game;
}

io.on("connection", (socket) => {
  const sessionId = socket.data.sessionId;
  socket.join(socket.data.gameSessionId);

  const game = gameOfSocket(socket);
  if (game) {
    socket.emit("game:state", playerStateFor(game, sessionId));
  }

  // Das Event kann mit oder ohne Payload kommen - der Acknowledgement-Callback
  // ist immer das letzte Argument.
  socket.on("game:state", (...args) => {
    const ack = args.find((arg) => typeof arg === "function");
    const game = gameOfSocket(socket);
    if (!game) {
      return fail(socket, ack, "Dieses Spiel ist abgelaufen");
    }
    const state = playerStateFor(game, sessionId);
    if (typeof ack === "function") {
      ack(state);
    }
    socket.emit("game:state", state);
  });

  /**
   * Ein Schuss: { x, y }. Beide Spieler erfahren Koordinate und Ergebnis,
   * danach ist der andere Spieler am Zug.
   */
  socket.on("game:shoot", (payload, ack) => {
    const game = gameOfSocket(socket);
    if (!game) {
      return fail(socket, ack, "Dieses Spiel ist abgelaufen");
    }
    if (game.phase === PHASES.FINISHED) {
      return fail(socket, ack, "Dieses Spiel ist schon entschieden");
    }
    if (game.phase !== PHASES.IN_PROGRESS) {
      return fail(socket, ack, "Das Spiel hat noch nicht begonnen");
    }
    if (game.turn !== sessionId) {
      return fail(socket, ack, "Sie sind nicht am Zug");
    }

    const x = payload && payload.x;
    const y = payload && payload.y;
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return fail(socket, ack, "x und y müssen ganze Zahlen sein");
    }
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
      return fail(
        socket,
        ack,
        `Die Koordinate muss auf dem ${BOARD_SIZE}x${BOARD_SIZE}-Spielfeld liegen`,
      );
    }
    if (game.shots[sessionId].some((shot) => shot.x === x && shot.y === y)) {
      return fail(socket, ack, "Auf dieses Feld haben Sie bereits geschossen");
    }

    const shot = registerShot(game, sessionId, x, y);
    const event = {
      by: roleOf(game, sessionId),
      x: shot.x,
      y: shot.y,
      result: shot.result,
      sunk: shot.sunk,
      phase: game.phase,
      turn: roleOf(game, game.turn),
      winner: roleOf(game, game.winner),
    };

    if (typeof ack === "function") {
      ack(event);
    }
    io.to(game.gameSessionId).emit("game:shot", event);

    if (game.winner) {
      io.to(game.gameSessionId).emit("game:over", {
        winner: roleOf(game, game.winner),
        ships: {
          first: game.ships[game.firstPlayerId],
          second: game.ships[game.secondPlayerId],
        },
      });
    }
  });
});

setInterval(removeExpiredGames, CLEANUP_INTERVAL_MS);

httpServer.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
