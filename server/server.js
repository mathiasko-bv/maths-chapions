const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, game: "Math Wars", rooms: rooms.size });
});

function cleanText(value, max = 24) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

function makeRoomCode() {
  let code;
  do {
    code = "MW-" + crypto.randomBytes(2).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
}

function playerView(p) {
  return {
    id: p.id,
    name: p.name,
    score: p.score,
    connected: p.connected,
    ready: p.ready
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    players: [...room.players.values()].map(playerView),
    roundIndex: room.roundIndex,
    questionNumber: room.questionNumber,
    totalQuestions: room.totalQuestions,
    currentQuestion: room.currentQuestion
      ? {
          text: room.currentQuestion.text,
          category: room.currentQuestion.category,
          difficulty: room.currentQuestion.difficulty,
          timeLimit: room.currentQuestion.timeLimit
        }
      : null,
    remainingMs: room.questionDeadline
      ? Math.max(0, room.questionDeadline - Date.now())
      : 0
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function sortPlayers(room) {
  return [...room.players.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}

const questionBank = {
  mental: [
    { text: "25 × 16 = ?", answer: 400, explanation: "25 × 16 = 25 × (8 × 2) = 400", difficulty: "easy", timeLimit: 8 },
    { text: "144 ÷ 12 = ?", answer: 12, explanation: "12 × 12 = 144, donc 144 ÷ 12 = 12.", difficulty: "easy", timeLimit: 8 },
    { text: "17 + 28 = ?", answer: 45, explanation: "17 + 20 + 8 = 45.", difficulty: "easy", timeLimit: 7 },
    { text: "15² = ?", answer: 225, explanation: "15 × 15 = 225.", difficulty: "easy", timeLimit: 8 },
    { text: "20% de 250 = ?", answer: 50, explanation: "10% de 250 = 25, donc 20% = 50.", difficulty: "easy", timeLimit: 9 },
    { text: "3/4 + 1/4 = ?", answer: 1, explanation: "Les dénominateurs sont identiques : 3/4 + 1/4 = 4/4 = 1.", difficulty: "easy", timeLimit: 9 },
    { text: "36 × 7 = ?", answer: 252, explanation: "30 × 7 + 6 × 7 = 210 + 42 = 252.", difficulty: "normal", timeLimit: 9 },
    { text: "480 ÷ 16 = ?", answer: 30, explanation: "16 × 30 = 480.", difficulty: "normal", timeLimit: 8 },
    { text: "2⁵ = ?", answer: 32, explanation: "2 × 2 × 2 × 2 × 2 = 32.", difficulty: "normal", timeLimit: 8 },
    { text: "75% de 80 = ?", answer: 60, explanation: "75% = 3/4, et 3/4 de 80 = 60.", difficulty: "normal", timeLimit: 9 },
    { text: "7 × 8 + 6 = ?", answer: 62, explanation: "Multiplication d'abord : 56 + 6 = 62.", difficulty: "normal", timeLimit: 8 },
    { text: "√144 = ?", answer: 12, explanation: "12 × 12 = 144.", difficulty: "easy", timeLimit: 7 },
    { text: "2,5 × 4 = ?", answer: 10, explanation: "25 × 4 = 100, puis on replace la virgule : 10.", difficulty: "easy", timeLimit: 8 },
    { text: "1/2 + 1/3 = ?", answer: 5/6, explanation: "PPCM 6 : 3/6 + 2/6 = 5/6.", difficulty: "normal", timeLimit: 12 }
  ],
  algebra: [
    { text: "Si f(x)=2x+3, alors f(4) = ?", answer: 11, explanation: "f(4)=2×4+3=11.", difficulty: "easy", timeLimit: 10 },
    { text: "Résoudre : 2x + 5 = 17. x = ?", answer: 6, explanation: "2x=12 donc x=6.", difficulty: "easy", timeLimit: 10 },
    { text: "Résoudre : 3x − 9 = 0. x = ?", answer: 3, explanation: "3x=9 donc x=3.", difficulty: "easy", timeLimit: 9 },
    { text: "Si g(x)=x², g(−5) = ?", answer: 25, explanation: "(−5)²=25.", difficulty: "easy", timeLimit: 9 },
    { text: "Résoudre : x/4 = 7. x = ?", answer: 28, explanation: "On multiplie les deux membres par 4 : x=28.", difficulty: "easy", timeLimit: 9 },
    { text: "La dérivée de x² est ?", answer: 2, explanation: "La dérivée de x² est 2x. Ici la question attend le coefficient devant x : 2.", difficulty: "normal", timeLimit: 10 },
    { text: "Si f(x)=3x−2, f(5) = ?", answer: 13, explanation: "3×5−2=15−2=13.", difficulty: "easy", timeLimit: 9 },
    { text: "Résoudre : 5x = 45. x = ?", answer: 9, explanation: "45 ÷ 5 = 9.", difficulty: "easy", timeLimit: 8 },
    { text: "Si u₀=2 et u₁=5, avec u(n+1)=u(n)+3, u₂ = ?", answer: 8, explanation: "u₂=u₁+3=8.", difficulty: "normal", timeLimit: 10 },
    { text: "Résoudre : x² = 49. Donne la valeur positive de x.", answer: 7, explanation: "La racine carrée positive de 49 est 7.", difficulty: "easy", timeLimit: 9 }
  ],
  problems: [
    { text: "Un article coûte 8 000 FCFA. Il augmente de 25%. Nouveau prix ?", answer: 10000, explanation: "25% de 8 000 = 2 000. Total = 10 000 FCFA.", difficulty: "normal", timeLimit: 18 },
    { text: "Un rectangle mesure 8 cm par 5 cm. Son aire vaut combien ?", answer: 40, explanation: "A = longueur × largeur = 8 × 5 = 40 cm².", difficulty: "easy", timeLimit: 12 },
    { text: "Un trajet de 120 km est parcouru en 2 h. Vitesse moyenne en km/h ?", answer: 60, explanation: "v = d/t = 120/2 = 60 km/h.", difficulty: "easy", timeLimit: 12 },
    { text: "Une classe compte 30 élèves. 40% sont des filles. Combien de filles ?", answer: 12, explanation: "0,40 × 30 = 12.", difficulty: "easy", timeLimit: 12 },
    { text: "Un capital de 20 000 FCFA gagne 10%. Montant final ?", answer: 22000, explanation: "10% de 20 000 = 2 000, donc 22 000.", difficulty: "easy", timeLimit: 13 },
    { text: "Un triangle a base 10 cm et hauteur 6 cm. Aire ?", answer: 30, explanation: "A = (10×6)/2 = 30 cm².", difficulty: "normal", timeLimit: 14 },
    { text: "On lance un dé équilibré. Combien de résultats possibles ?", answer: 6, explanation: "Un dé classique possède 6 faces.", difficulty: "easy", timeLimit: 10 },
    { text: "Une suite arithmétique commence à 4 et a raison 3. Quel est le 5e terme ?", answer: 16, explanation: "4, 7, 10, 13, 16.", difficulty: "normal", timeLimit: 13 }
  ],
  final: [
    { text: "Si 2x + 3 = 5x − 12, x = ?", answer: 5, explanation: "15 = 3x donc x=5.", difficulty: "hard", timeLimit: 14 },
    { text: "La somme des angles d'un triangle vaut combien de degrés ?", answer: 180, explanation: "Dans la géométrie euclidienne, la somme vaut 180°.", difficulty: "easy", timeLimit: 8 },
    { text: "Si f(x)=x²−4x, f(6) = ?", answer: 12, explanation: "36−24=12.", difficulty: "normal", timeLimit: 12 },
    { text: "Un nombre augmenté de 20% devient 120. Quel était le nombre ?", answer: 100, explanation: "1,2x=120 donc x=100.", difficulty: "hard", timeLimit: 15 },
    { text: "Quel est le PGCD de 48 et 18 ?", answer: 6, explanation: "Les diviseurs communs culminent à 6.", difficulty: "normal", timeLimit: 12 },
    { text: "Si a=3 et b=4, a²+b² = ?", answer: 25, explanation: "9+16=25.", difficulty: "easy", timeLimit: 8 }
  ]
};

function cloneQuestion(q, category) {
  return { ...q, category, id: crypto.randomUUID() };
}

function buildQuestions(room) {
  const rounds = [
    { key: "mental", count: 30 },
    { key: "algebra", count: 30 },
    { key: "problems", count: 40 },
    { key: "final", count: 45 }
  ];
  return rounds.map(r => {
    const source = [...questionBank[r.key]];
    source.sort(() => Math.random() - 0.5);
    return source.slice(0, Math.min(r.count, source.length)).map(q => cloneQuestion(q, r.key));
  });
}

function clearRoomTimers(room) {
  if (room.timer) clearTimeout(room.timer);
  if (room.nextTimer) clearTimeout(room.nextTimer);
  room.timer = null;
  room.nextTimer = null;
}

function startRoom(room) {
  if (room.state !== "lobby") return;
  if (room.players.size < 2) return;
  const readyPlayers = [...room.players.values()].filter(p => p.ready || p.id === room.hostId);
  if (readyPlayers.length < 2) return;

  room.state = "countdown";
  room.roundIndex = 0;
  room.questionNumber = -1;
  room.questions = buildQuestions(room);
  room.currentQuestion = null;
  room.answers = new Map();
  emitRoom(room);

  let n = 3;
  io.to(room.code).emit("game:countdown", { seconds: n });
  room.timer = setInterval(() => {
    n--;
    if (n > 0) io.to(room.code).emit("game:countdown", { seconds: n });
    else {
      clearInterval(room.timer);
      room.timer = null;
      beginQuestion(room);
    }
  }, 1000);
}

function beginQuestion(room) {
  if (room.state === "finished") return;

  const list = room.questions[room.roundIndex] || [];
  room.questionNumber++;

  if (room.questionNumber >= list.length) {
    if (room.roundIndex >= room.questions.length - 1) {
      finishGame(room);
      return;
    }
    room.roundIndex++;
    room.questionNumber = 0;
  }

  const q = room.questions[room.roundIndex][room.questionNumber];
  room.currentQuestion = q;
  room.answers = new Map();
  room.state = "question";
  room.questionDeadline = Date.now() + q.timeLimit * 1000;

  io.to(room.code).emit("game:question", {
    round: room.roundIndex,
    roundName: roundName(room.roundIndex),
    questionNumber: room.questionNumber + 1,
    totalQuestions: room.questions[room.roundIndex].length,
    text: q.text,
    category: q.category,
    difficulty: q.difficulty,
    timeLimit: q.timeLimit,
    serverNow: Date.now(),
    deadline: room.questionDeadline
  });
  emitRoom(room);

  room.timer = setTimeout(() => endQuestion(room, "timeout"), q.timeLimit * 1000 + 100);
}

function roundName(index) {
  return ["⚡ Calcul mental", "📈 Fonctions & algèbre", "🧠 Problèmes mathématiques", "🔥 Finale Math Battle"][index] || "Math Wars";
}

function endQuestion(room, reason) {
  if (room.state !== "question") return;
  clearRoomTimers(room);
  room.state = "results";

  const results = [...room.answers.values()]
    .sort((a, b) => a.receivedAt - b.receivedAt)
    .map(x => ({ ...x }));

  io.to(room.code).emit("game:results", {
    correctAnswer: room.currentQuestion.answer,
    explanation: room.currentQuestion.explanation,
    reason,
    results,
    leaderboard: sortPlayers(room).map(playerView)
  });

  emitRoom(room);

  room.nextTimer = setTimeout(() => {
    if (room.state !== "finished") beginQuestion(room);
  }, 2200);
}

function finishGame(room) {
  clearRoomTimers(room);
  room.state = "finished";
  room.currentQuestion = null;
  room.questionDeadline = null;
  const podium = sortPlayers(room).map((p, i) => ({
    rank: i + 1,
    id: p.id,
    name: p.name,
    score: p.score,
    connected: p.connected
  }));
  io.to(room.code).emit("game:finished", { podium });
  emitRoom(room);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name }, cb) => {
    const playerName = cleanText(name, 20) || "Joueur";
    const code = makeRoomCode();
    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      connected: true,
      ready: true
    };
    const room = {
      code,
      hostId: socket.id,
      players: new Map([[socket.id, player]]),
      state: "lobby",
      roundIndex: 0,
      questionNumber: -1,
      totalQuestions: 0,
      questions: [],
      currentQuestion: null,
      questionDeadline: null,
      answers: new Map(),
      timer: null,
      nextTimer: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = socket.id;
    cb?.({ ok: true, room: publicRoom(room), playerId: socket.id });
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name }, cb) => {
    const roomCode = cleanText(code, 12).toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ ok: false, error: "Salle introuvable." });
    if (room.state !== "lobby") return cb?.({ ok: false, error: "La partie a déjà commencé." });
    if (room.players.size >= MAX_PLAYERS) return cb?.({ ok: false, error: "Salle complète." });

    const playerName = cleanText(name, 20) || "Joueur";
    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      connected: true,
      ready: false
    };
    room.players.set(socket.id, player);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.playerId = socket.id;

    cb?.({ ok: true, room: publicRoom(room), playerId: socket.id });
    emitRoom(room);
  });

  socket.on("room:ready", ({ ready }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb?.({ ok: false, error: "Salle introuvable." });
    const p = room.players.get(socket.id);
    if (!p) return cb?.({ ok: false, error: "Joueur introuvable." });
    p.ready = Boolean(ready);
    emitRoom(room);
    cb?.({ ok: true });
  });

  socket.on("game:start", cb => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return cb?.({ ok: false, error: "Salle introuvable." });
    if (room.hostId !== socket.id) return cb?.({ ok: false, error: "Seul l'hôte peut lancer la partie." });
    if (room.players.size < 2) return cb?.({ ok: false, error: "Il faut au moins 2 joueurs." });
    startRoom(room);
    cb?.({ ok: true });
  });

  socket.on("game:answer", ({ answer }, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.state !== "question") return cb?.({ ok: false, error: "Aucune question active." });
    if (!room.players.has(socket.id)) return cb?.({ ok: false, error: "Joueur introuvable." });
    if (room.answers.has(socket.id)) return cb?.({ ok: false, error: "Réponse déjà envoyée." });

    const now = Date.now();
    if (now > room.questionDeadline) return cb?.({ ok: false, error: "Temps écoulé." });

    const raw = String(answer ?? "").trim().replace(",", ".");
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return cb?.({ ok: false, error: "Réponse invalide." });

    const q = room.currentQuestion;
    const correct = Math.abs(numeric - Number(q.answer)) < 1e-9;
    const correctSoFar = [...room.answers.values()].filter(x => x.correct).length;
    let points = 0;
    if (correct) points = correctSoFar === 0 ? 3 : correctSoFar === 1 ? 2 : correctSoFar === 2 ? 1 : 0;

    const p = room.players.get(socket.id);
    p.score += points;

    room.answers.set(socket.id, {
      playerId: socket.id,
      name: p.name,
      answer: raw,
      correct,
      points,
      receivedAt: now
    });

    cb?.({ ok: true, correct, points });
    io.to(room.code).emit("game:answerReceived", {
      playerId: socket.id,
      name: p.name,
      correct,
      points,
      answerCount: room.answers.size
    });

    if (correct && correctSoFar >= 2) {
      endQuestion(room, "three-correct");
    } else if (room.answers.size >= room.players.size) {
      endQuestion(room, "all-answered");
    } else {
      emitRoom(room);
    }
  });

  socket.on("room:state", cb => {
    const room = rooms.get(socket.data.roomCode);
    cb?.({ ok: Boolean(room), room: room ? publicRoom(room) : null });
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.connected = false;

    if (room.state === "lobby") {
      room.players.delete(socket.id);
      if (room.hostId === socket.id) {
        const next = room.players.values().next().value;
        if (next) room.hostId = next.id;
      }
      if (room.players.size === 0) {
        clearRoomTimers(room);
        rooms.delete(room.code);
        return;
      }
    }
    emitRoom(room);
  });
});

server.listen(PORT, () => {
  console.log(`Math Wars running on http://localhost:${PORT}`);
});
