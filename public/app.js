(() => {
  const socket = io();
  const $ = id => document.getElementById(id);
  const screens = ["home","join","create","lobby","game","results","podium"];
  let room = null;
  let myId = null;
  let selectedSize = 2;
  let timerInterval = null;
  let lastQuestion = null;

  function show(id){
    screens.forEach(x => $(x).classList.toggle("active", x === id));
    window.scrollTo(0,0);
  }

  function toast(message){
    const t=$("toast"); t.textContent=message; t.classList.add("show");
    setTimeout(()=>t.classList.remove("show"),1800);
  }

  function name(){
    return ($("playerName").value || "").trim().slice(0,20) || "Joueur";
  }

  function renderPlayers(){
    if(!room)return;
    $("lobbyCode").textContent=room.code;
    $("playerCount").textContent=`${room.players.length}/8`;
    $("lobbyState").textContent=room.state==="lobby" ? "En attente" : "Partie en cours";
    const list=$("players");
    list.innerHTML="";
    room.players.forEach((p,i)=>{
      const div=document.createElement("div"); div.className="player";
      const initial=(p.name[0]||"?").toUpperCase();
      div.innerHTML=`<div class="avatar">${initial}</div><div class="pinfo"><div class="pname">${escapeHtml(p.name)} ${p.id===room.hostId?'<span class="host">👑 HÔTE</span>':''}</div><div class="pstatus ${p.ready?'ready':''}">${p.ready?'✓ Prêt':'En attente'}${p.connected?'':' · hors ligne'}</div></div><b>${p.score} pts</b>`;
      list.appendChild(div);
    });
    const me=room.players.find(p=>p.id===myId);
    $("readyBtn").textContent=me?.ready ? "✓ Prêt — cliquer pour annuler" : "✓ Je suis prêt";
    $("startBtn").classList.toggle("hidden", room.hostId!==myId || room.state!=="lobby");
  }

  function renderBoard(players){
    const sorted=[...(players||[])].sort((a,b)=>b.score-a.score);
    $("liveBoard").innerHTML=sorted.map((p,i)=>`<div class="leader"><span class="rank">${i+1}</span><span class="lname">${escapeHtml(p.name)}${p.id===myId?' <b>(toi)</b>':''}</span><span class="points">${p.score} pts</span></div>`).join("");
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }

  function startTimer(deadline){
    clearInterval(timerInterval);
    const tick=()=>{
      const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));
      $("timer").textContent=seconds;
      if(seconds<=3)$("timer").style.borderColor="#ff5f70";
      else $("timer").style.borderColor="var(--accent)";
      if(seconds<=0)clearInterval(timerInterval);
    };
    tick(); timerInterval=setInterval(tick,100);
  }

  function showCountdown(seconds){
    $("countdownNumber").textContent=seconds;
    $("countdown").classList.remove("hidden");
  }

  function hideCountdown(){ $("countdown").classList.add("hidden"); }

  $("createBtn").addEventListener("click",()=>show("create"));
  $("joinBtn").addEventListener("click",()=>show("join"));
  document.querySelectorAll(".back").forEach(b=>b.addEventListener("click",()=>show(b.dataset.go)));

  document.querySelectorAll("[data-size]").forEach(b=>{
    b.addEventListener("click",()=>{
      selectedSize=Number(b.dataset.size);
      document.querySelectorAll("[data-size]").forEach(x=>x.classList.toggle("selected",x===b));
    });
  });

  $("createConfirm").addEventListener("click",()=>{
    $("createError").textContent="";
    socket.emit("room:create",{name:name(),roomName:$("roomName").value,maxPlayers:selectedSize,difficulty:$("difficulty").value},res=>{
      if(!res?.ok){$("createError").textContent=res?.error||"Erreur";return}
      room=res.room;myId=res.playerId;renderPlayers();show("lobby");
    });
  });

  $("joinConfirm").addEventListener("click",()=>{
    $("joinError").textContent="";
    socket.emit("room:join",{name:name(),code:$("roomCode").value},res=>{
      if(!res?.ok){$("joinError").textContent=res?.error||"Impossible de rejoindre";return}
      room=res.room;myId=res.playerId;renderPlayers();show("lobby");
    });
  });

  $("readyBtn").addEventListener("click",()=>{
    const me=room?.players.find(p=>p.id===myId);
    socket.emit("room:ready",{ready:!me?.ready});
  });

  $("startBtn").addEventListener("click",()=>{
    socket.emit("game:start",res=>{if(!res?.ok)toast(res.error)});
  });

  $("copyRoom").addEventListener("click",async()=>{
    const text=`Rejoins ma partie Math Wars 🏆 avec le code ${room.code}`;
    try{await navigator.clipboard.writeText(text);toast("Invitation copiée !")}catch{toast(`Code : ${room.code}`)}
  });

  $("answerForm").addEventListener("submit",e=>{
    e.preventDefault();
    if(!lastQuestion)return;
    const input=$("answer");
    const value=input.value.trim();
    if(!value){toast("Entre une réponse");return}
    socket.emit("game:answer",{answer:value},res=>{
      if(!res?.ok){$("answerStatus").textContent=res?.error||"Réponse refusée";return}
      input.disabled=true;
      $("answerStatus").textContent=res.correct ? `✅ Bonne réponse ! +${res.points} point(s)` : "❌ Mauvaise réponse";
      $("answerStatus").style.color=res.correct?"var(--accent2)":"var(--danger)";
    });
  });

  $("backHome").addEventListener("click",()=>{room=null;myId=null;show("home")});

  socket.on("connect",()=>{
    $("connection").textContent="● En ligne";
    $("connection").className="connection online";
    if(room) socket.emit("room:state",res=>{if(res.ok){room=res.room;renderPlayers()}});
  });

  socket.on("disconnect",()=>{
    $("connection").textContent="● Reconnexion…";
    $("connection").className="connection offline";
  });

  socket.on("room:update",data=>{
    room=data; renderPlayers();
    if(data.state==="lobby" && $("lobby").classList.contains("active")) show("lobby");
  });

  socket.on("game:countdown",({seconds})=>{
    show("game");showCountdown(seconds);
  });

  socket.on("game:question",data=>{
    hideCountdown();
    lastQuestion=data;
    $("roundLabel").textContent=`Manche ${data.round+1}`;
    $("roundName").textContent=data.roundName;
    $("qNumber").textContent=`QUESTION ${data.questionNumber}/${data.totalQuestions}`;
    $("qDifficulty").textContent=String(data.difficulty).toUpperCase();
    $("question").textContent=data.text;
    $("answer").value="";$("answer").disabled=false;$("answer").focus();
    $("answerStatus").textContent="Réponds le plus vite possible !";$("answerStatus").style.color="var(--muted)";
    startTimer(data.deadline);
    if(room)renderBoard(room.players);
  });

  socket.on("game:answerReceived",data=>{
    if(data.playerId===myId && data.correct) toast(`+${data.points} point(s)`);
  });

  socket.on("game:results",data=>{
    clearInterval(timerInterval);
    $("correctAnswer").textContent=data.correctAnswer;
    $("explanation").textContent=data.explanation;
    $("resultTitle").textContent=data.reason==="timeout"?"⏱️ Temps écoulé":"📣 Résultats";
    const rows=[...data.results].sort((a,b)=>a.receivedAt-b.receivedAt);
    $("resultList").innerHTML=rows.length
      ? rows.map((r,i)=>`<div class="result-row"><b>${r.correct?['🥇','🥈','🥉'][Math.min(i,2)]:'•'}</b><span class="rname">${escapeHtml(r.name)}</span><span class="${r.correct?'ok':'bad'}">${r.correct?'+'+r.points+' pt(s)':'✕'}</span></div>`).join("")
      : '<div class="result-row">Personne n’a répondu.</div>';
    renderBoard(data.leaderboard);
    show("results");
    setTimeout(()=>{if(room?.state!=="finished")show("game")},1800);
  });

  socket.on("game:finished",data=>{
    clearInterval(timerInterval);
    const medals=["🥇","🥈","🥉"];
    $("podiumList").innerHTML=data.podium.map((p,i)=>`<div class="podium-item ${i===0?'first':''}"><div class="medal">${medals[i]||'🏅'}</div><div class="pod-name">${escapeHtml(p.name)}<small style="display:block;color:var(--muted);font-weight:500">${i===0?'Champion Math Wars':''}</small></div><div class="pod-score">${p.score} pts</div></div>`).join("");
    show("podium");
  });

  // Auto-fill a demo-friendly name only if empty.
  if(!$("playerName").value)$("playerName").value="Joueur";
})();
