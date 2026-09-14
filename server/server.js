const express = require('express')
const {v4: uuidv4} = require('uuid');
const cookieParser = require('cookie-parser');
const app = express()
const port = 3000;

app.use(cookieParser());
app.use(express.json());

const GAME_TTL_MS = 1000 * 60 * 60;
const CLEANUP_INTERVAL_MS = 1000 * 60;
const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'http://localhost:5173';

const BOARD_SIZE = 10;
const FLEET = [
    {name: 'Träger', size: 5},
    {name: 'Schlachtschiff', size: 4},
    {name: 'Kreuzer', size: 3},
    {name: 'U-Boot', size: 3},
    {name: 'Zerstörer', size: 2}
];

const PHASES = {
    WAITING_FOR_PLAYER: 'WAITING_FOR_PLAYER',
    PLACING_SHIPS: 'PLACING_SHIPS',
    IN_PROGRESS: 'IN_PROGRESS'
};

const games = [];

function isExpired(game) {
    return game.expiresAt <= Date.now();
}

function removeExpiredGames() {
    for (let i = games.length - 1; i >= 0; i--) {
        if (isExpired(games[i])) {
            games.splice(i, 1);
        }
    }
}

function findActiveGameOfPlayer(sessionId) {
    if (!sessionId) {
        return undefined;
    }
    return games.find(game => !isExpired(game)
        && (game.firstPlayerId === sessionId || game.secondPlayerId === sessionId));
}

function resolveSessionId(cookie) {
    return cookie || uuidv4();
}

function setSessionCookie(res, sessionId) {
    res.cookie('SESSION_ID', sessionId, {
        httpOnly: true,
        maxAge: GAME_TTL_MS,
        sameSite: "lax",
        secure: false /*Only in Development*/
    });
}

function inviteUrl(gameSessionId) {
    return `${CLIENT_BASE_URL}/join/${gameSessionId}`;
}

function updatePhase(game) {
    if (!game.secondPlayerId) {
        game.phase = PHASES.WAITING_FOR_PLAYER;
        return;
    }
    const bothPlaced = Boolean(game.ships[game.firstPlayerId]) && Boolean(game.ships[game.secondPlayerId]);
    game.phase = bothPlaced ? PHASES.IN_PROGRESS : PHASES.PLACING_SHIPS;
}

function publicGameInfo(game) {
    return {
        gameSessionId: game.gameSessionId,
        phase: game.phase,
        playerCount: game.secondPlayerId ? 2 : 1,
        joinable: !game.secondPlayerId,
        createdAt: new Date(game.createdAt).toISOString(),
        expiresAt: new Date(game.expiresAt).toISOString(),
        expiresInMs: Math.max(0, game.expiresAt - Date.now())
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
        ships: {}
    };
    games.push(game);
    return {userSessionId: userSessionId, game: game};
}

/**
 * Lädt das Spiel aus der URL und stellt sicher, dass es noch nicht abgelaufen ist.
 */
function requireGame(req, res, next) {
    const game = games.find(game => game.gameSessionId === req.params.gameSessionId);
    if (!game) {
        return res.status(404).send({error: 'Dieses Spiel existiert nicht'});
    }
    if (isExpired(game)) {
        return res.status(410).send({error: 'Dieses Spiel ist abgelaufen'});
    }
    req.game = game;
    next();
}

/**
 * Stellt sicher, dass der Aufrufer über seine Session einer der beiden Spieler ist.
 */
function requirePlayer(req, res, next) {
    const sessionId = req.cookies.SESSION_ID;
    if (!sessionId || (req.game.firstPlayerId !== sessionId && req.game.secondPlayerId !== sessionId)) {
        return res.status(403).send({error: 'Sie sind kein Spieler dieser Partie'});
    }
    req.playerSessionId = sessionId;
    req.opponentSessionId = req.game.firstPlayerId === sessionId
        ? req.game.secondPlayerId
        : req.game.firstPlayerId;
    next();
}

function shipCells(ship) {
    const cells = [];
    for (let i = 0; i < ship.size; i++) {
        cells.push(ship.orientation === 'horizontal'
            ? {x: ship.x + i, y: ship.y}
            : {x: ship.x, y: ship.y + i});
    }
    return cells;
}

/**
 * Prüft die Flotte eines Spielers und gibt eine Fehlermeldung zurück, oder null wenn alles passt.
 */
function validateShips(ships) {
    if (!Array.isArray(ships) || ships.length !== FLEET.length) {
        return `Es müssen genau ${FLEET.length} Schiffe platziert werden`;
    }

    for (const ship of ships) {
        if (!ship || typeof ship !== 'object') {
            return 'Jedes Schiff muss ein Objekt mit x, y, size und orientation sein';
        }
        if (!Number.isInteger(ship.x) || !Number.isInteger(ship.y) || !Number.isInteger(ship.size)) {
            return 'x, y und size müssen ganze Zahlen sein';
        }
        if (ship.orientation !== 'horizontal' && ship.orientation !== 'vertical') {
            return "orientation muss 'horizontal' oder 'vertical' sein";
        }
    }

    const expectedSizes = FLEET.map(ship => ship.size).sort((a, b) => a - b);
    const actualSizes = ships.map(ship => ship.size).sort((a, b) => a - b);
    if (expectedSizes.join(',') !== actualSizes.join(',')) {
        return `Die Flotte muss aus Schiffen der Längen ${expectedSizes.join(', ')} bestehen`;
    }

    const occupied = new Set();
    for (const ship of ships) {
        for (const cell of shipCells(ship)) {
            if (cell.x < 0 || cell.y < 0 || cell.x >= BOARD_SIZE || cell.y >= BOARD_SIZE) {
                return `Alle Schiffe müssen vollständig auf dem ${BOARD_SIZE}x${BOARD_SIZE}-Spielfeld liegen`;
            }
            const key = `${cell.x},${cell.y}`;
            if (occupied.has(key)) {
                return 'Schiffe dürfen sich nicht überlappen';
            }
            occupied.add(key);
        }
    }

    return null;
}

app.post('/games/start', (req, res) => {
    removeExpiredGames();
    let cookie = req.cookies.SESSION_ID;
    if (findActiveGameOfPlayer(cookie)) {
        return res.status(409).send({error: 'Beenden Sie zuerst das andere Spiel'});
    }
    let {userSessionId, game} = startGame(cookie);
    setSessionCookie(res, userSessionId);
    res.send({
        gameSessionId: game.gameSessionId,
        inviteUrl: inviteUrl(game.gameSessionId),
        expiresAt: new Date(game.expiresAt).toISOString(),
        expiresInMs: game.expiresAt - Date.now(),
        phase: game.phase,
        fleet: FLEET,
        boardSize: BOARD_SIZE
    });
})

/**
 * Öffentliche Infos zu einem Spiel, damit die Einladungsseite anzeigen kann,
 * ob man noch beitreten kann und wann das Spiel abläuft.
 */
app.get('/games/:gameSessionId', requireGame, (req, res) => {
    res.send(publicGameInfo(req.game));
})

/**
 * Beitritt über den Einladungslink: der zweite Spieler erhält eine Session
 * und danach können beide Spieler ihre Schiffe platzieren.
 */
app.post('/games/:gameSessionId/join', requireGame, (req, res) => {
    removeExpiredGames();
    const game = req.game;
    const cookie = req.cookies.SESSION_ID;

    if (cookie && (game.firstPlayerId === cookie || game.secondPlayerId === cookie)) {
        setSessionCookie(res, cookie);
        return res.send({
            gameSessionId: game.gameSessionId,
            alreadyJoined: true,
            phase: game.phase,
            expiresAt: new Date(game.expiresAt).toISOString(),
            fleet: FLEET,
            boardSize: BOARD_SIZE
        });
    }
    if (game.secondPlayerId) {
        return res.status(409).send({error: 'Dieses Spiel ist bereits voll'});
    }
    if (findActiveGameOfPlayer(cookie)) {
        return res.status(409).send({error: 'Beenden Sie zuerst das andere Spiel'});
    }

    const userSessionId = resolveSessionId(cookie);
    game.secondPlayerId = userSessionId;
    updatePhase(game);

    setSessionCookie(res, userSessionId);
    res.send({
        gameSessionId: game.gameSessionId,
        alreadyJoined: false,
        phase: game.phase,
        expiresAt: new Date(game.expiresAt).toISOString(),
        expiresInMs: game.expiresAt - Date.now(),
        fleet: FLEET,
        boardSize: BOARD_SIZE
    });
})

/**
 * Aktueller Stand aus Sicht des anfragenden Spielers.
 */
app.get('/games/:gameSessionId/state', requireGame, requirePlayer, (req, res) => {
    const game = req.game;
    res.send({
        ...publicGameInfo(game),
        yourRole: game.firstPlayerId === req.playerSessionId ? 'first' : 'second',
        yourShips: game.ships[req.playerSessionId] || null,
        youArePlaced: Boolean(game.ships[req.playerSessionId]),
        opponentPlaced: Boolean(req.opponentSessionId && game.ships[req.opponentSessionId]),
        fleet: FLEET,
        boardSize: BOARD_SIZE
    });
})

/**
 * Schiffe platzieren. Beide Spieler platzieren ihre eigene Flotte genau einmal.
 */
app.post('/games/:gameSessionId/ships', requireGame, requirePlayer, (req, res) => {
    const game = req.game;
    if (game.ships[req.playerSessionId]) {
        return res.status(409).send({error: 'Sie haben Ihre Schiffe bereits platziert'});
    }

    const error = validateShips(req.body && req.body.ships);
    if (error) {
        return res.status(400).send({error: error});
    }

    game.ships[req.playerSessionId] = req.body.ships.map(ship => ({
        x: ship.x,
        y: ship.y,
        size: ship.size,
        orientation: ship.orientation
    }));
    updatePhase(game);

    res.send({
        phase: game.phase,
        yourShips: game.ships[req.playerSessionId],
        opponentPlaced: Boolean(req.opponentSessionId && game.ships[req.opponentSessionId]),
        waitingForOpponent: game.phase !== PHASES.IN_PROGRESS,
        expiresAt: new Date(game.expiresAt).toISOString()
    });
})

setInterval(removeExpiredGames, CLEANUP_INTERVAL_MS);

app.listen(port, () => {
    console.log(`Server started on port ${port}`)
})
