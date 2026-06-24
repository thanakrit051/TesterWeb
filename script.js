// ============================================================
//  HandQuiz — script.js
//  ระบบหลัก: hand tracking, game state, timer, scoring
// ============================================================

// ---- State ----
const STATE = {
  sets: [],          // ชุดคำถามทั้งหมด (โหลดจาก LocalStorage + questions.json)
  selectedSet: null, // ชุดคำถามที่เลือก
  questions: [],     // คำถามในรอบนี้
  currentQ: 0,       // index คำถามปัจจุบัน
  score: 0,
  correct: 0,
  wrong: 0,

  // timer
  timePerQ: 15,      // วินาทีต่อข้อ
  timeLeft: 15,
  timerInterval: null,

  // dwell (ค้างนิ้ว)
  dwellZone: null,   // 'left' | 'right' | null
  dwellStart: null,
  dwellDuration: 1000, // ms ที่ต้องค้าง
  answered: false,

  // hand tracking
  handX: -1,
  handY: -1,
  camReady: false,
  mpCamera: null,    // MediaPipe Camera instance
};

// ---- DOM refs ----
const $ = id => document.getElementById(id);
const screens = { menu: $('screen-menu'), game: $('screen-game'), result: $('screen-result') };

// ============================================================
//  SCREENS
// ============================================================
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ============================================================
//  LOAD QUESTIONS
// ============================================================
async function loadSets() {
  const uid = auth.currentUser.uid;
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists && doc.data().sets && doc.data().sets.length > 0) {
      STATE.sets = doc.data().sets;
    } else {
      // ยังไม่มีข้อมูล → โหลดจาก questions.json แล้วบันทึกขึ้น
      const res  = await fetch('questions.json');
      const data = await res.json();
      STATE.sets = data;
      await db.collection('users').doc(uid).set({ sets: data });
    }
  } catch(e) {
    console.warn('Firebase error, ใช้ชุดตัวอย่างแทน:', e);
    STATE.sets = getDefaultSets();
  }
  renderSetList();
}

function getDefaultSets() {
  return [{
    id: 'default',
    title: 'ตัวอย่างคำถาม',
    questions: [
      { question: '2 + 2 = ?',  leftAnswer: '4', rightAnswer: '5', correct: 'left' },
      { question: '10 - 3 = ?', leftAnswer: '6', rightAnswer: '7', correct: 'right' },
      { question: '3 × 4 = ?',  leftAnswer: '12', rightAnswer: '14', correct: 'left' },
    ]
  }];
}

// ============================================================
//  MENU
// ============================================================
function renderSetList() {
  const list = $('set-list');
  list.innerHTML = '';
  STATE.sets.forEach(set => {
    const card = document.createElement('div');
    card.className = 'set-card';
    card.dataset.id = set.id;
    card.innerHTML = `
      <span>${set.title}</span>
      <span class="set-card-count">${set.questions.length} ข้อ</span>
    `;
    card.addEventListener('click', () => selectSet(set, card));
    list.appendChild(card);
  });
}

function selectSet(set, card) {
  document.querySelectorAll('.set-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  STATE.selectedSet = set;
  $('btn-start').disabled = false;
}

$('btn-start').addEventListener('click', () => {
  if (!STATE.selectedSet) return;
  startGame(STATE.selectedSet);
});

$('btn-admin').addEventListener('click', () => {
  window.location.href = 'admin.html';
});

// ============================================================
//  GAME START
// ============================================================
function startGame(set) {
  STATE.questions  = [...set.questions];
  STATE.currentQ   = 0;
  STATE.score      = 0;
  STATE.correct    = 0;
  STATE.wrong      = 0;
  STATE.answered   = false;

  $('hud-set-title').textContent = set.title;

  showScreen('game');
  initCamera();
  loadQuestion();
}

// ============================================================
//  QUESTION FLOW
// ============================================================
function loadQuestion() {
  const q = STATE.questions[STATE.currentQ];
  if (!q) { endGame(); return; }

  STATE.answered  = false;
  STATE.dwellZone = null;
  STATE.dwellStart = null;

  // reset ring
  setRingProgress('left', 0);
  setRingProgress('right', 0);

  // reset zone states
  $('zone-left').className  = 'answer-zone zone-left';
  $('zone-right').className = 'answer-zone zone-right';

  // คำถาม + คำตอบ
  $('question-text').textContent = q.question;
  $('ans-left').textContent      = q.leftAnswer;
  $('ans-right').textContent     = q.rightAnswer;

  // HUD
  $('hud-progress').textContent = `${STATE.currentQ + 1}/${STATE.questions.length}`;
  $('hud-score').textContent    = STATE.score;

  // hide feedback
  const fb = $('feedback-overlay');
  fb.className = 'feedback-overlay';

  startTimer();
}

// ============================================================
//  TIMER
// ============================================================
function startTimer() {
  clearInterval(STATE.timerInterval);
  STATE.timeLeft = STATE.timePerQ;
  updateTimerUI();

  STATE.timerInterval = setInterval(() => {
    STATE.timeLeft -= 0.2;
    updateTimerUI();
    if (STATE.timeLeft <= 0) {
      clearInterval(STATE.timerInterval);
      if (!STATE.answered) timeOut();
    }
  }, 200);
}

function updateTimerUI() {
  const pct = (STATE.timeLeft / STATE.timePerQ) * 100;
  const bar = $('timer-bar');
  bar.style.width = pct + '%';
  $('question-timer').textContent = Math.ceil(STATE.timeLeft) + 's';
  bar.className = 'timer-bar' + (pct < 30 ? ' danger' : pct < 60 ? ' warning' : '');
}

function timeOut() {
  // ไม่ตอบทันเวลา — นับเป็นผิด
  showFeedback(false, null);
}

// ============================================================
//  ANSWER SELECTION
// ============================================================
function selectAnswer(side) {
  if (STATE.answered) return;
  STATE.answered = true;
  clearInterval(STATE.timerInterval);

  const q = STATE.questions[STATE.currentQ];
  const isCorrect = side === q.correct;

  // Points: base 100 + bonus เวลาเหลือ
  if (isCorrect) {
    const bonus = Math.floor(STATE.timeLeft * 10);
    STATE.score  += 100 + bonus;
    STATE.correct++;
  } else {
    STATE.wrong++;
  }

  // zone visual
  const zone = side === 'left' ? $('zone-left') : $('zone-right');
  zone.classList.add(isCorrect ? 'correct' : 'wrong');

  showFeedback(isCorrect, side);
}

function showFeedback(isCorrect, side) {
  const fb = $('feedback-overlay');
  fb.className = 'feedback-overlay show ' + (isCorrect ? 'correct' : 'wrong');

  $('feedback-icon').textContent  = isCorrect ? '✓' : '✗';
  $('feedback-text').textContent  = isCorrect ? 'ถูกต้อง!' : 'ผิด!';
  $('feedback-points').textContent = isCorrect
    ? '+' + (100 + Math.floor(STATE.timeLeft * 10))
    : '';

  playSound(isCorrect);
  $('hud-score').textContent = STATE.score;

  setTimeout(() => {
    STATE.currentQ++;
    loadQuestion();
  }, 1400);
}

// ============================================================
//  RING PROGRESS
// ============================================================
function setRingProgress(side, pct) {
  const circumference = 150.8;
  const offset = circumference * (1 - pct);
  const ring = $('ring-' + side);
  ring.style.strokeDashoffset = offset;
}

// ============================================================
//  DWELL LOGIC (นิ้วค้าง 1 วินาที)
// ============================================================
function updateDwell(zone) {
  // zone = 'left' | 'right' | null
  if (STATE.answered) return;

  if (zone !== STATE.dwellZone) {
    // เปลี่ยนโซน: reset
    STATE.dwellZone  = zone;
    STATE.dwellStart = zone ? performance.now() : null;

    // reset ring ทั้งคู่
    setRingProgress('left', 0);
    setRingProgress('right', 0);

    $('zone-left').classList.remove('hovering');
    $('zone-right').classList.remove('hovering');

    if (zone) {
      $('zone-' + zone).classList.add('hovering');
    }
    return;
  }

  if (!zone) return;

  // คำนวณ progress
  const elapsed = performance.now() - STATE.dwellStart;
  const pct = Math.min(elapsed / STATE.dwellDuration, 1);
  setRingProgress(zone, pct);

  // ถึง 100% → เลือกคำตอบ
  if (pct >= 1) {
    selectAnswer(zone);
  }
}

// ============================================================
//  CAMERA + MEDIAPIPE
// ============================================================
function resizeCanvas() {
  const canvas = $('overlay-canvas');
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', resizeCanvas);

function initCamera() {
  const video  = $('webcam');
  const canvas = $('overlay-canvas');
  const noCam  = $('no-cam');

  resizeCanvas();

  const hands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6,
  });

  hands.onResults(results => {
    const canvas = $('overlay-canvas');
    resizeCanvas();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      STATE.handX = -1;
      STATE.handY = -1;
      updateDwell(null);
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    // landmark 8 = นิ้วชี้ (Index Finger Tip)
    const tip = landmarks[8];

    const cx = tip.x * canvas.width;
    const cy = tip.y * canvas.height;
    STATE.handX = cx;
    STATE.handY = cy;

    drawCursor(ctx, cx, cy);

    // video มี scaleX(-1) ดังนั้น tip.x จากกล้องต้องพลิก
    // tip.x < 0.5 = ซ้ายในกล้อง = ขวาบนหน้าจอ (ฝั่ง B)
    const zone = tip.x < 0.5 ? 'right' : 'left';
    updateDwell(zone);
  });

  // ใช้ MediaPipe Camera class จัดการกล้องเอง (ไม่ต้องเรียก getUserMedia แยก)
  const camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 1280,
    height: 720,
  });

  STATE.mpCamera = camera;

  camera.start()
    .then(() => {
      STATE.camReady = true;
    })
    .catch(err => {
      console.warn('Camera error:', err);
      noCam.style.display = 'flex';
      // Keyboard fallback
      document.addEventListener('keydown', handleKeyboard);
    });
}

// วาด cursor วงกลมสีม่วงพร้อม glow
function drawCursor(ctx, x, y) {
  // outer glow
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(108,99,255,0.2)';
  ctx.fill();

  // outer ring
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.strokeStyle = '#6C63FF';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // center dot
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#BAFF29';
  ctx.fill();
}

// ============================================================
//  KEYBOARD FALLBACK (ถ้าไม่มีกล้อง)
// ============================================================
function handleKeyboard(e) {
  if (STATE.answered) return;
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  selectAnswer('left');
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') selectAnswer('right');
}

// ============================================================
//  SOUND (Web Audio API)
// ============================================================
let audioCtx;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(correct) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (correct) {
      osc.frequency.setValueAtTime(523, ctx.currentTime);       // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
    }

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) { /* ignore */ }
}

// ============================================================
//  END GAME
// ============================================================
function stopCamera() {
  if (STATE.mpCamera) {
    STATE.mpCamera.stop();
    STATE.mpCamera = null;
  }
  const video = $('webcam');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  STATE.camReady = false;
}

function endGame() {
  clearInterval(STATE.timerInterval);
  stopCamera();
  document.removeEventListener('keydown', handleKeyboard);

  const total = STATE.questions.length;
  const pct   = total > 0 ? Math.round((STATE.correct / total) * 100) : 0;

  $('result-score-big').textContent = STATE.score;
  $('stat-correct').textContent     = STATE.correct;
  $('stat-wrong').textContent       = STATE.wrong;
  $('stat-pct').textContent         = pct + '%';

  $('result-emoji').textContent = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪';

  showScreen('result');
}

// ============================================================
//  RESULT BUTTONS
// ============================================================
$('btn-retry').addEventListener('click', () => {
  if (STATE.selectedSet) startGame(STATE.selectedSet);
});

$('btn-back-menu').addEventListener('click', () => {
  showScreen('menu');
  renderSetList();
});

$('btn-exit').addEventListener('click', () => {
  clearInterval(STATE.timerInterval);
  stopCamera();
  document.removeEventListener('keydown', handleKeyboard);
  showScreen('menu');
});

// ============================================================
//  INIT — ต้อง login ก่อนถึงจะใช้งานได้
// ============================================================
requireAuth().then(user => {
  // แสดง email ผู้ใช้
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = user.email || user.displayName || '';

  loadSets();
  showScreen('menu');
});
