require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── ENV ────────────────────────────────────────────────────────────────────
const MASTER_PASSWORD  = process.env.MASTER_PASSWORD  || 'hogwarts2024';
const SPECTATOR_PASSWORD = process.env.SPECTATOR_PASSWORD || '';
const PORT = process.env.PORT || 3000;

// ─── GAME DATA ───────────────────────────────────────────────────────────────
const PARTICIPANTS = {
  'Corvinal':   ['Allan Viana','Augusto Moraes','Bruna Mirella','Clara Avelina','Deborah Alves','Derek Assis','Eduarda Gomes','Eduardo Lobo','Eltton Souza','Erik Menezes','Fabio Silva','Fernanda Barros','Gabriel Fidelis','Isabel Souza','Jackson Erlan','Joshua Otavio','Marcilio Queiroz','Nathalia Vasconcelos','Pablo Moacir','Pedro Cerquinho','Phelipe Lira','Rafaella Sena','Renata Nogueira','Wanessa Barbosa','Wennyo Pontes'],
  'Grifinória': ['Adriana Figueiroa','Aline Oliveira','Alysson Cavalcanti','Ana Beatriz','Carlos Alberto','Douglas Cavalcanti','Enock Oliveira','Geraldo Barros','Guilherme Fernandes','Halef Victor','Hillary Borges','Jean Schott','Jhenifer Kelly','Marcello Lins','Marcelo Cavalcanti','Maria Julia','Marllon Silva','Michelle Lira','Mirely Oliveira','Rafael Monte','Samuel Queiroz','Simao Pedro','Taciana Farias','Thais Ribeiro','Williane Melo'],
  'Lufa-Lufa':  ['Adna Sales','Amanda Ronchi','Caio Ferreira','Cristiangile Soares','Danilo Ribeiro','Edmilson Silva','Eduardo Henrique','Elivelton Pereira','Eliza Andrade','Fausto Santos','Gabriel Romao','Gabriele Nayara','Gabrielle Talmon','Izabela Cristina','Jamilly Eloi','Joao Lacerda','João Victor','Maria Eduarda','Mateus Moises','Pollyanne Ramos','Rafael Magalhães','Rayane Medeiros','Tais Cabral','Thaís Ramos','Vivian Oliveira'],
  'Sonserina':  ['Aline Louzado','Andre Vasconcelos','Antonio Eduardo','Brunna Dias','Daniel Filho','Daniel Monte','Edna Silva','Edson Campitelli','Francielly Oliveira','Gabriela Maria','Gilza Gabriela','Herven Lira','Jeniffer Lima','Leonardo Soares','Lucas Rodrigues','Luiz Trovao','Marcelo Matos','Mozart Mendes','Pedro Albuquerque','Sophia Sales','Stefany Santana','Thiago Cardozo','Thiago Ferreira','Thyago Melo','Walisson Pernambuco'],
};

const HOUSE_WORDS = {
  'Corvinal':   ['Sabedoria','Criatividade','Inovação','Observação','Curiosidade','Imaginação','Raciocínio','Originalidade','Erudição','Espírito questionador'],
  'Grifinória': ['Coragem','Determinação','Ousadia','Bravura','Heroísmo','Nobreza','Lealdade','Proatividade','Confiabilidade','Espírito de liderança'],
  'Lufa-Lufa':  ['Justiça','Empatia','Trabalho em equipe','Paciência','Honestidade','Dedicação','Humildade','Gentileza','Resiliência','Espírito acolhedor'],
  'Sonserina':  ['Poder','Ambição','Astúcia','Inteligência estratégica','Persistência','Autoconfiança elevada','Foco estratégico','Liderança calculista','Habilidade de persuasão','Independência'],
};

// ─── STATE ───────────────────────────────────────────────────────────────────
function buildAllWords() {
  const all = [];
  Object.entries(HOUSE_WORDS).forEach(([house, words]) => {
    words.forEach(word => all.push({ word, house }));
  });
  // Shuffle all 40 words
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

function createGameState() {
  return {
    status: 'waiting',      // waiting | sorting | active | paused | finished
    words: [],              // all 40 words (shuffled), revealed after sorting hat
    playerStates: {},       // name -> { house, selected: Set, attempts: 0, solved: false }
    winner: null,
    startedAt: null,
  };
}

let game = createGameState();

// ─── WEBSOCKET CLIENTS ───────────────────────────────────────────────────────
// clients: Map<ws, { type, name, house }>
const clients = new Map();

function broadcast(data, excludeWs = null) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function buildPublicState(forName = null) {
  // Build ranking: top players, how many they've solved (0 or solved)
  const ranking = Object.entries(game.playerStates)
    .map(([name, ps]) => ({
      name,
      house: ps.house,
      solved: ps.solved,
      attempts: ps.attempts,
    }))
    .sort((a, b) => {
      if (a.solved && !b.solved) return -1;
      if (!a.solved && b.solved) return 1;
      return a.attempts - b.attempts;
    });

  // Count solved per house
  const houseSolved = {};
  Object.keys(PARTICIPANTS).forEach(h => houseSolved[h] = 0);
  Object.values(game.playerStates).forEach(ps => {
    if (ps.solved) houseSolved[ps.house]++;
  });

  const base = {
    status: game.status,
    words: game.status !== 'waiting' ? game.words : [],
    ranking,
    houseSolved,
    winner: game.winner,
    connectedCount: clients.size,
    startedAt: game.startedAt,
  };

  // If player, include their personal state (without revealing correct answers)
  if (forName && game.playerStates[forName]) {
    const ps = game.playerStates[forName];
    base.myState = {
      selected: [...ps.selected],
      attempts: ps.attempts,
      solved: ps.solved,
    };
  }

  return base;
}

function getPlayerHouse(name) {
  for (const [house, players] of Object.entries(PARTICIPANTS)) {
    if (players.includes(name)) return house;
  }
  return null;
}

// ─── WS HANDLERS ─────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  send(ws, { type: 'state', data: buildPublicState() });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'auth': {
        const { role, name, password } = msg;

        if (role === 'master') {
          if (password !== MASTER_PASSWORD) { send(ws, { type: 'auth_error', message: 'Senha incorreta' }); return; }
          clients.set(ws, { type: 'master', name: 'Mestre' });
          send(ws, { type: 'auth_ok', role: 'master' });
          send(ws, { type: 'state', data: buildPublicState() });
          return;
        }

        if (role === 'spectator') {
          if (SPECTATOR_PASSWORD && password !== SPECTATOR_PASSWORD) {
            send(ws, { type: 'auth_error', message: 'Senha incorreta' }); return;
          }
          clients.set(ws, { type: 'spectator', name: 'Espectador' });
          send(ws, { type: 'auth_ok', role: 'spectator' });
          send(ws, { type: 'state', data: buildPublicState() });
          return;
        }

        if (role === 'player') {
          const house = getPlayerHouse(name);
          if (!house) { send(ws, { type: 'auth_error', message: 'Nome não encontrado' }); return; }
          clients.set(ws, { type: 'player', name, house });
          // Register player in game state
          if (!game.playerStates[name]) {
            game.playerStates[name] = { house, selected: new Set(), attempts: 0, solved: false };
          }
          send(ws, { type: 'auth_ok', role: 'player', name, house });
          send(ws, { type: 'state', data: buildPublicState(name) });
          broadcastConnected();
          return;
        }
        break;
      }

      case 'master_start': {
        const info = clients.get(ws);
        if (!info || info.type !== 'master') return;
        game.status = 'sorting'; // sorting hat animation
        game.words = buildAllWords();
        game.startedAt = Date.now();
        // Reset all player selections
        Object.values(game.playerStates).forEach(ps => {
          ps.selected = new Set();
          ps.attempts = 0;
          ps.solved = false;
        });
        // Broadcast sorting hat phase
        broadcast({ type: 'sorting_hat' });
        // After 4s, reveal words
        setTimeout(() => {
          game.status = 'active';
          broadcast({ type: 'state', data: buildPublicState() });
          // Send personalized state to each player
          for (const [cws, cinfo] of clients) {
            if (cinfo.type === 'player') {
              send(cws, { type: 'state', data: buildPublicState(cinfo.name) });
            }
          }
        }, 4000);
        break;
      }

      case 'master_pause': {
        const info = clients.get(ws);
        if (!info || info.type !== 'master') return;
        game.status = game.status === 'paused' ? 'active' : 'paused';
        broadcast({ type: 'state', data: buildPublicState() });
        break;
      }

      case 'master_reset': {
        const info = clients.get(ws);
        if (!info || info.type !== 'master') return;
        game = createGameState();
        // Re-register all connected players
        for (const [, cinfo] of clients) {
          if (cinfo.type === 'player') {
            game.playerStates[cinfo.name] = { house: cinfo.house, selected: new Set(), attempts: 0, solved: false };
          }
        }
        broadcast({ type: 'state', data: buildPublicState() });
        break;
      }

      case 'player_submit': {
        const info = clients.get(ws);
        if (!info || info.type !== 'player') return;
        if (game.status !== 'active') return;

        const ps = game.playerStates[info.name];
        if (!ps || ps.solved) return;

        const { selected } = msg; // array of word strings
        if (!Array.isArray(selected) || selected.length !== 10) {
          send(ws, { type: 'submit_error', message: 'Selecione exatamente 10 palavras' });
          return;
        }

        ps.attempts++;
        const correctWords = new Set(HOUSE_WORDS[info.house]);
        const allCorrect = selected.every(w => correctWords.has(w));

        if (allCorrect) {
          ps.solved = true;
          ps.selected = new Set(selected);

          // Check if first to finish
          if (!game.winner) {
            game.winner = { name: info.name, house: info.house, attempts: ps.attempts };
            game.status = 'finished';
          }

          send(ws, { type: 'submit_result', correct: true });
          broadcast({ type: 'state', data: buildPublicState() });
          for (const [cws, cinfo] of clients) {
            if (cinfo.type === 'player') {
              send(cws, { type: 'state', data: buildPublicState(cinfo.name) });
            }
          }
        } else {
          // Wrong — reset selection, don't reveal which were correct
          ps.selected = new Set();
          send(ws, { type: 'submit_result', correct: false, attempts: ps.attempts });
          // Broadcast ranking update
          broadcast({ type: 'state', data: buildPublicState() });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastConnected();
  });
});

function broadcastConnected() {
  broadcast({ type: 'connected_count', count: clients.size });
}

// ─── REST: config endpoint (sends public config to frontend) ─────────────────
app.get('/api/config', (req, res) => {
  res.json({
    participants: PARTICIPANTS,
    spectatorNeedsPassword: !!SPECTATOR_PASSWORD,
  });
});

// ─── START ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🧙 Hogwarts Game Server rodando na porta ${PORT}`);
  console.log(`   MASTER_PASSWORD: ${MASTER_PASSWORD ? '✓ configurado' : '⚠ não configurado'}`);
});
