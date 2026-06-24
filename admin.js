// ============================================================
//  HandQuiz — admin.js
//  จัดการชุดคำถาม: CRUD, Import, Export
// ============================================================

const $ = id => document.getElementById(id);

// ---- State ----
let sets = [];
let activeSetId = null;
let saveTimer = null;

// ============================================================
//  LOAD / SAVE
// ============================================================
async function loadSets() {
  try {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid || !db) throw new Error('no-auth-or-db');
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists && doc.data().sets && doc.data().sets.length > 0) {
      sets = doc.data().sets;
    } else {
      // ยังไม่มีใน Firestore → โหลดจาก questions.json
      try {
        const res  = await fetch('questions.json');
        const data = await res.json();
        sets = data;
        await saveSets();
      } catch {
        sets = [];
      }
    }
  } catch(e) {
    console.warn('Firebase error:', e);
    sets = [];
  }
  renderSidebar();
}

async function saveSets() {
  try {
    const uid = auth.currentUser && auth.currentUser.uid;
    if (!uid || !db) throw new Error('no-auth-or-db');
    await db.collection('users').doc(uid).set({ sets });
  } catch(e) {
    console.error('บันทึกไม่สำเร็จ:', e);
    showToast('บันทึกไม่สำเร็จ', 'error');
  }
}

// debounce save เพื่อไม่ให้บันทึกบ่อยเกินไปขณะพิมพ์
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSets();
    renderSidebarCounts();
  }, 400);
}

// ============================================================
//  SIDEBAR
// ============================================================
function renderSidebar() {
  const list = $('set-sidebar-list');
  list.innerHTML = '';
  sets.forEach(set => {
    const item = document.createElement('div');
    item.className = 'set-sidebar-item' + (set.id === activeSetId ? ' active' : '');
    item.dataset.id = set.id;
    item.innerHTML = `
      <span class="set-sidebar-name">${escHtml(set.title)}</span>
      <span class="set-sidebar-count">${set.questions.length} ข้อ</span>
    `;
    item.addEventListener('click', () => openSet(set.id));
    list.appendChild(item);
  });
}

function renderSidebarCounts() {
  document.querySelectorAll('.set-sidebar-item').forEach(item => {
    const set = sets.find(s => s.id === item.dataset.id);
    if (set) item.querySelector('.set-sidebar-count').textContent = set.questions.length + ' ข้อ';
  });
}

// ============================================================
//  OPEN / EDIT SET
// ============================================================
function openSet(id) {
  activeSetId = id;
  const set = sets.find(s => s.id === id);
  if (!set) return;

  // sidebar highlight
  document.querySelectorAll('.set-sidebar-item').forEach(i => {
    i.classList.toggle('active', i.dataset.id === id);
  });

  $('empty-state').style.display  = 'none';
  $('set-editor').style.display   = 'block';

  $('set-title-input').value = set.title;
  renderQuestionsTable(set);
  updateMeta(set);
}

function getActiveSet() { return sets.find(s => s.id === activeSetId); }

function updateMeta(set) {
  $('editor-meta').textContent = `${set.questions.length} ข้อ · แก้ไขล่าสุดอัตโนมัติ`;
}

// ---- Title input ----
$('set-title-input').addEventListener('input', () => {
  const set = getActiveSet();
  if (!set) return;
  set.title = $('set-title-input').value;
  scheduleSave();
  // update sidebar
  const item = document.querySelector(`.set-sidebar-item[data-id="${activeSetId}"] .set-sidebar-name`);
  if (item) item.textContent = set.title;
});

// ============================================================
//  QUESTIONS TABLE
// ============================================================
function renderQuestionsTable(set) {
  const tbody = $('questions-tbody');
  tbody.innerHTML = '';
  set.questions.forEach((q, i) => {
    tbody.appendChild(createQRow(q, i));
  });
  updateMeta(set);
}

function createQRow(q, i) {
  const tr = document.createElement('tr');
  tr.className = 'q-row';
  tr.dataset.index = i;

  tr.innerHTML = `
    <td><span class="q-num">${i + 1}</span></td>
    <td><input class="q-input q-question" type="text" value="${escAttr(q.question)}" placeholder="คำถาม..." maxlength="120"></td>
    <td><input class="q-input q-left"     type="text" value="${escAttr(q.leftAnswer)}" placeholder="ตอบ A..." maxlength="60"></td>
    <td><input class="q-input q-right"    type="text" value="${escAttr(q.rightAnswer)}" placeholder="ตอบ B..." maxlength="60"></td>
    <td>
      <select class="correct-select">
        <option value="left"  ${q.correct === 'left'  ? 'selected' : ''}>A (ซ้าย)</option>
        <option value="right" ${q.correct === 'right' ? 'selected' : ''}>B (ขวา)</option>
      </select>
    </td>
    <td><button class="btn-del-row" title="ลบข้อนี้">✕</button></td>
  `;

  // Events
  const inputs = tr.querySelectorAll('.q-input, .correct-select');
  inputs.forEach(inp => inp.addEventListener('input', () => syncRowToData(tr)));

  tr.querySelector('.btn-del-row').addEventListener('click', () => deleteQuestion(i));

  return tr;
}

function syncRowToData(tr) {
  const set = getActiveSet();
  if (!set) return;
  const i   = parseInt(tr.dataset.index);
  const q   = set.questions[i];
  if (!q) return;

  q.question   = tr.querySelector('.q-question').value;
  q.leftAnswer = tr.querySelector('.q-left').value;
  q.rightAnswer= tr.querySelector('.q-right').value;
  q.correct    = tr.querySelector('.correct-select').value;
  scheduleSave();
}

function renumberRows() {
  document.querySelectorAll('.q-row').forEach((tr, i) => {
    tr.dataset.index = i;
    tr.querySelector('.q-num').textContent = i + 1;
  });
}

// ============================================================
//  ADD / DELETE QUESTION
// ============================================================
$('btn-add-q').addEventListener('click', () => {
  const set = getActiveSet();
  if (!set) return;
  const newQ = { question: '', leftAnswer: '', rightAnswer: '', correct: 'left' };
  set.questions.push(newQ);

  const tbody = $('questions-tbody');
  const row   = createQRow(newQ, set.questions.length - 1);
  tbody.appendChild(row);
  row.querySelector('.q-question').focus();

  updateMeta(set);
  scheduleSave();
});

function deleteQuestion(index) {
  const set = getActiveSet();
  if (!set) return;
  if (!confirm(`ลบข้อที่ ${index + 1} ใช่ไหม?`)) return;

  set.questions.splice(index, 1);
  renderQuestionsTable(set);
  saveSets();
  showToast('ลบคำถามแล้ว', 'error');
}

// ============================================================
//  NEW SET
// ============================================================
$('btn-new-set').addEventListener('click', () => {
  const id  = 'set_' + Date.now();
  const set = { id, title: 'ชุดคำถามใหม่', questions: [] };
  sets.push(set);
  saveSets();
  renderSidebar();
  openSet(id);
  setTimeout(() => { $('set-title-input').select(); }, 50);
});

// ============================================================
//  DELETE SET
// ============================================================
$('btn-delete-set').addEventListener('click', () => {
  const set = getActiveSet();
  if (!set) return;
  if (!confirm(`ลบชุด "${set.title}" ทั้งหมดใช่ไหม?`)) return;

  sets = sets.filter(s => s.id !== activeSetId);
  activeSetId = null;
  saveSets();
  renderSidebar();

  $('set-editor').style.display  = 'none';
  $('empty-state').style.display = 'flex';
  showToast('ลบชุดคำถามแล้ว', 'error');
});

// ============================================================
//  EXPORT JSON
// ============================================================
$('btn-export').addEventListener('click', () => {
  const set = getActiveSet();
  if (!set) return;

  const json = JSON.stringify([set], null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `handquiz-${set.title.replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export สำเร็จ ✓', 'success');
});

// ============================================================
//  IMPORT JSON
// ============================================================
$('btn-import').addEventListener('click', () => $('file-import').click());

$('file-import').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      let data = JSON.parse(ev.target.result);
      // รองรับทั้ง array และ single object
      if (!Array.isArray(data)) data = [data];

      let imported = 0;
      data.forEach(s => {
        if (!s.title || !Array.isArray(s.questions)) return;
        // สร้าง id ใหม่เสมอเพื่อป้องกันชนกัน
        s.id = 'set_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        sets.push(s);
        imported++;
      });

      saveSets();
      renderSidebar();
      showToast(`Import ${imported} ชุดสำเร็จ ✓`, 'success');

      // เปิดชุดแรกที่ import
      if (data[0]) openSet(data[0].id);
    } catch(err) {
      showToast('ไฟล์ JSON ไม่ถูกต้อง', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset เพื่อ import ซ้ำได้
});

// ============================================================
//  TOAST
// ============================================================
let toastTimer;
function showToast(msg, type = '') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className   = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2200);
}

// ============================================================
//  UTILS
// ============================================================
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(str) {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ============================================================
//  INIT — ต้อง login ก่อนถึงจะใช้งานได้
// ============================================================
requireAuth().then(user => {
  const emailEl = document.getElementById('admin-user-email');
  if (emailEl) emailEl.textContent = user.email || user.displayName || '';
  loadSets();
});
