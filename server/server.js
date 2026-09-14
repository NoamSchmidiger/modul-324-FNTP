const express = require('express')
const {v4: uuidv4} = require('uuid');
const cookieParser = require('cookie-parser');
const app = express()
const port = 3000;

app.use(cookieParser());

const games = [];

function startGame(cookie) {
    let userSessionId = uuidv4();
    if(cookie) {
        userSessionId = cookie;
    }
    const gameSessionId = uuidv4();
    games.push({
        gameSessionId: gameSessionId,
        firstPlayerId: userSessionId,
        secondPlayerId: null
    });
    return {userSessionId: userSessionId, gameSessionId: gameSessionId};
}

app.post('/games/start', (req, res) => {
    let cookie = req.cookies.SESSION_ID;
    if(cookie && games.find(game => game.firstPlayerId === cookie || game.secondPlayerId === cookie)) {
        return res.status(409).send({error: 'Beenden Sie zuerst das andere Spiel'});
    }
    let game = startGame(cookie);
    res.cookie('SESSION_ID', game.userSessionId, { httpOnly: true, maxAge: 1000 * 60 * 60, sameSite: "lax", secure: false /*Only in Development*/ });
    res.send({gameSessionId: game.gameSessionId});
})

app.listen(port, () => {
    console.log(`Server started on port ${port}`)
})