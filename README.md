# Math Wars 🏆

Math Wars is a real-time multiplayer math competition.

## Included

- 2–8 players per room
- Room creation and room code joining
- Live lobby
- Server-authoritative game state
- 4 rounds:
  - Round 1: Calcul mental
  - Round 2: Fonctions & algèbre
  - Round 3: Problèmes mathématiques
  - Final: Math Battle
- First correct answer: 3 points
- Second correct answer: 2 points
- Third correct answer: 1 point
- Live leaderboard
- Final podium
- Reconnection support during a game
- Responsive mobile-first interface
- Question explanations
- No database required for the MVP

## Requirements

Node.js 18+ recommended.

## Run

```bash
npm install
npm start
```

Open:

http://localhost:3000

For two devices on the same Wi-Fi, open the computer's LAN address, for example:

http://192.168.1.20:3000

For real Internet play, deploy the Node.js app on a service supporting WebSockets (Render, Railway, Fly.io, VPS, etc.) and use the public HTTPS URL.

## Production notes

This MVP stores active rooms in server memory. Restarting the server clears active games. For persistent accounts, global rankings and durable match history, add PostgreSQL/Redis in a later production version.

The server is authoritative for scores, answer order, timers and round state. The client never decides who won.
