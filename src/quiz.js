// src/quiz.js
import { AppState } from './config.js';
import { speakText } from './utils.js';
import { generateAIQuestions } from './ai-services.js';
import { updateWordSRSToBackend } from './api.js';
import { renderList } from './ui.js';

function getDayKey(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function resetStudySessionIfNeeded(force = false) {
    const todayKey = getDayKey();
    if (force || AppState.sessionDayKey !== todayKey) {
        AppState.sessionDayKey = todayKey;
        AppState.sessionDoneCount = 0;
        AppState.sessionQueue = [];
        AppState.sessionSeenIds = new Set();
    }
}

function computePriority(word, now) {
    // Higher = more urgent
    const nextReview = word.nextReview || 0;
    const overdueMs = Math.max(0, now - nextReview);
    const overdueDays = Math.min(overdueMs / 86400000, 60); // cap for stability

    const level = word.level || 0;
    const ease = word.easeFactor !== undefined ? word.easeFactor : 2.5;
    const interval = word.interval !== undefined ? word.interval : 0;

    // Weight design:
    // - heavily favor overdue
    // - favor low level & low ease
    // - slight favor for short intervals (weaker memory)
    const overdueScore = overdueDays * 3.0;
    const levelScore = (5 - Math.min(level, 5)) * 1.5;
    const easeScore = (2.6 - Math.min(Math.max(ease, 1.3), 2.6)) * 4.0; // ease 1.3 => big boost
    const intervalScore = Math.max(0, (10 - Math.min(interval, 10))) * 0.2;

    // Avoid infinite loops with non-finite values
    const score = overdueScore + levelScore + easeScore + intervalScore;
    return Number.isFinite(score) ? Math.max(0.1, score) : 1.0;
}

function weightedSampleNoReplace(items, weights, k) {
    const chosen = [];
    const localItems = items.slice();
    const localWeights = weights.slice();

    const total = () => localWeights.reduce((s, w) => s + w, 0);
    const pickIndex = (r) => {
        let acc = 0;
        for (let i = 0; i < localWeights.length; i++) {
            acc += localWeights[i];
            if (r <= acc) return i;
        }
        return localWeights.length - 1;
    };

    while (chosen.length < k && localItems.length > 0) {
        const t = total();
        if (t <= 0) break;
        const r = Math.random() * t;
        const idx = pickIndex(r);
        chosen.push(localItems[idx]);
        localItems.splice(idx, 1);
        localWeights.splice(idx, 1);
    }
    return chosen;
}

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildEnglishVariants(base) {
    const w = String(base || '').trim();
    if (!w) return [];
    // Keep it lightweight & safe: cover common inflections only.
    const variants = new Set();
    variants.add(w);

    // Possessive / contraction-ish
    variants.add(`${w}'s`);

    const lower = w.toLowerCase();

    // Plurals: s / es / ies
    variants.add(`${w}s`);

    const endsWithEs = /(s|x|z|ch|sh|o)$/i.test(lower);
    if (endsWithEs) variants.add(`${w}es`);

    const yToIes = /[^aeiou]y$/i.test(lower);
    if (yToIes) {
        variants.add(`${w.slice(0, -1)}ies`);
    }

    // Past: ed / d / ied
    if (lower.endsWith('e')) {
        variants.add(`${w}d`);
    } else if (yToIes) {
        variants.add(`${w.slice(0, -1)}ied`);
    } else {
        variants.add(`${w}ed`);
    }

    // Present participle: ing (basic rules)
    if (lower.endsWith('ie')) {
        variants.add(`${w.slice(0, -2)}ying`); // die -> dying
    } else if (lower.endsWith('e') && !/(ee|ye|oe)$/i.test(lower)) {
        variants.add(`${w.slice(0, -1)}ing`); // make -> making
    } else {
        variants.add(`${w}ing`);
    }

    return Array.from(variants);
}

function getFillBlankRegex(wordObj) {
    const w = (wordObj?.w || '').trim();
    if (!w) return null;
    if (wordObj.l === 'CN') {
        return new RegExp(escapeRegex(w), 'g');
    }
    const variants = buildEnglishVariants(w).map(escapeRegex);
    // \b ensures whole-word match; allow apostrophe inside token (e.g., word's)
    return new RegExp(`\\b(?:${variants.join('|')})\\b`, 'gi');
}

function exampleContainsWord(wordObj) {
    const w = (wordObj?.w || '').trim();
    const ex = (wordObj?.ex || '').trim();
    if (!w || !ex) return false;
    if (wordObj.l === 'CN') {
        return ex.includes(w);
    }
    const rx = getFillBlankRegex(wordObj);
    return rx ? rx.test(ex) : false;
}

function buildSessionQueueFromDue() {
    resetStudySessionIfNeeded(false);
    if (!AppState.currentUser) return;
    if (AppState.sessionQueue.length > 0) return;

    const now = Date.now();
    const due = AppState.dueWords || [];
    if (due.length === 0) return;

    const limit = AppState.sessionLimit || 30;
    const weights = due.map(w => computePriority(w, now));
    const picked = weightedSampleNoReplace(due, weights, Math.min(limit, due.length));
    AppState.sessionQueue = picked.map(w => w.id);
}

function getNextSessionWordId(preferredLang = null, requireExample = false) {
    resetStudySessionIfNeeded(false);
    buildSessionQueueFromDue();
    if (!AppState.sessionQueue || AppState.sessionQueue.length === 0) return null;

    const candidates = [];
    for (const id of AppState.sessionQueue) {
        if (AppState.sessionSeenIds.has(id)) continue;
        const w = AppState.cachedWords.find(x => x.id === id);
        if (!w) continue;
        if (preferredLang && w.l !== preferredLang) continue;
        if (requireExample && (!w.ex || w.ex.trim().length === 0)) continue;
        candidates.push(w);
    }
    if (candidates.length === 0) return null;

    const now = Date.now();
    const weights = candidates.map(w => computePriority(w, now));
    const picked = weightedSampleNoReplace(candidates, weights, 1)[0];
    return picked ? picked.id : null;
}

function getSessionWords({ preferredLang = null, requireExample = false } = {}) {
    resetStudySessionIfNeeded(false);
    buildSessionQueueFromDue();
    const out = [];
    for (const id of AppState.sessionQueue || []) {
        if (AppState.sessionSeenIds.has(id)) continue;
        const w = AppState.cachedWords.find(x => x.id === id);
        if (!w) continue;
        if (preferredLang && w.l !== preferredLang) continue;
        if (requireExample && (!w.ex || w.ex.trim().length === 0)) continue;
        out.push(w);
    }
    return out;
}

// Exported for Dictation to align selection logic
export function getNextStudyItem({ preferredLang = null, requireExample = false } = {}) {
    const id = getNextSessionWordId(preferredLang, requireExample);
    if (id) return AppState.cachedWords.find(w => w.id === id) || null;
    return null;
}

export function updateSRSStatus() {
    if (!AppState.currentUser) return;
    const now = Date.now();
    const filter = document.getElementById('quizFilter').value;
    
    // Đảm bảo pool không chứa từ trùng lặp ID (De-duplication safety layer)
    const uniqueMap = new Map();
    AppState.cachedWords.forEach(w => uniqueMap.set(w.id, w));
    const uniqueWords = Array.from(uniqueMap.values());

    let pool = filter === 'ALL' ? uniqueWords : uniqueWords.filter(w => w.l === filter);

    AppState.dueWords = pool.filter(w => (w.nextReview || 0) <= now).sort((a, b) => a.nextReview - b.nextReview);
    resetStudySessionIfNeeded(false);
    const sessionLimit = AppState.sessionLimit || 30;
    const sessionDone = AppState.sessionDoneCount || 0;
    const dueCount = AppState.dueWords.length;
    const quotaText = `Hôm nay: <b>${Math.min(sessionDone, sessionLimit)}/${sessionLimit}</b>`;
    const dueText = dueCount > 0 ? `Cần ôn: <b class="due-badge">${dueCount}</b> từ` : `<span style="color:var(--success)">Đã học xong!</span>`;
    const carryText = dueCount > sessionLimit ? ` <span style="color:#64748b">(còn lại dời sang phiên sau)</span>` : '';
    document.getElementById('reviewStatus').innerHTML = `${dueText} · ${quotaText}${carryText}`;

    const learnedCount = AppState.cachedWords.filter(w => (w.level || 0) > 0).length;
    const percent = Math.min((learnedCount / 300) * 100, 100);
    const pb = document.getElementById('progressBar');
    const pt = document.getElementById('progressText');
    if (pb) pb.style.width = percent + '%';
    if (pt) pt.innerText = `${learnedCount}/300`;
}

export function speakCurrent() {
    if (AppState.currentQuizItem) speakText(AppState.currentQuizItem.w, AppState.currentQuizItem.l, AppState.currentQuizItem.ex);
}

export function resetQuiz() {
    AppState.quizHistory = [];
    AppState.historyIndex = -1;
    AppState.isCramMode = false;
    AppState.quizFlowPhase = 'multiple_choice';
    AppState.mcRoundQueueIds = [];
    AppState.mcRoundWrongQueueIds = [];
    AppState.mcRoundCorrectIds = [];
    AppState.fillBlankQueueIds = [];
    AppState.matchWordsWordIds = [];
    resetStudySessionIfNeeded(true);
    nextQuestion();
}

export function showEmpty() {
    document.getElementById('quizArea').style.display = 'none';
    document.getElementById('emptyArea').style.display = 'block';
}

function ensureMultipleChoiceRound(filterValue, filteredPool, filteredDue) {
    if ((AppState.mcRoundQueueIds?.length || 0) > 0) return;
    if ((AppState.mcRoundCorrectIds?.length || 0) >= 6) return;

    const fallbackPool = filterValue === 'ALL' ? AppState.cachedWords : AppState.cachedWords.filter(w => w.l === filterValue);
    const dueWithExample = filteredDue.filter(exampleContainsWord);
    const poolWithExample = filteredPool.filter(exampleContainsWord);
    const fallbackWithExample = fallbackPool.filter(exampleContainsWord);
    const sourcePool = dueWithExample.length >= 6
        ? dueWithExample
        : (poolWithExample.length >= 6 ? poolWithExample : fallbackWithExample);
    const roundSize = Math.min(6, sourcePool.length);
    AppState.mcRoundQueueIds = sourcePool
        .slice()
        .sort(() => 0.5 - Math.random())
        .slice(0, roundSize)
        .map(w => w.id);
}

function showDoneArea() {
    document.getElementById('quizArea').style.display = 'none';
    document.getElementById('doneArea').style.display = 'block';
    document.getElementById('emptyArea').style.display = 'none';
}

export function nextQuestion() {
    if (!AppState.currentUser) return;
    if (AppState.historyIndex < AppState.quizHistory.length - 1) {
        AppState.historyIndex++; renderQuestion(AppState.quizHistory[AppState.historyIndex]); return;
    }
    updateSRSStatus();
    buildSessionQueueFromDue();
    
    const currentFilter = document.getElementById('quizFilter').value;
    const filteredPool = currentFilter === 'ALL' ? AppState.cachedWords : AppState.cachedWords.filter(w => w.l === currentFilter);
    const filteredDue = currentFilter === 'ALL' ? AppState.dueWords : AppState.dueWords.filter(w => w.l === currentFilter);

    const wordsWithEx = filteredPool.filter(w => w.ex && w.ex.trim().length > 0);
    if (!AppState.quizFlowPhase) AppState.quizFlowPhase = 'multiple_choice';
    let quizType = AppState.quizFlowPhase;

    let qData;

    if (quizType === 'match_words') {
        const targetIds = (AppState.matchWordsWordIds || []).slice(0, 6);
        const targetWords = targetIds
            .map(id => AppState.cachedWords.find(w => w.id === id))
            .filter(Boolean);
        if (targetWords.length < 2) {
            AppState.quizFlowPhase = 'done';
            return nextQuestion();
        }
        AppState.matchWordsWordIds = [];
        AppState.quizFlowPhase = 'done';
        
        // Tách riêng 2 bên: Trái (Từ gốc), Phải (Nghĩa) và xáo trộn độc lập
        const leftSide = targetWords.map(w => ({ id: w.id, text: w.w, type: 'word' })).sort(() => 0.5 - Math.random());
        const rightSide = targetWords.map(w => ({ id: w.id, text: w.m, type: 'meaning' })).sort(() => 0.5 - Math.random());

        // Gộp xen kẽ để khi hiển thị Grid 2 cột sẽ chia đúng 2 bẻn
        const pairs = [];
        for (let i = 0; i < leftSide.length; i++) {
            pairs.push(leftSide[i]);
            pairs.push(rightSide[i]);
        }

        qData = {
            type: 'match_words',
            pairs: pairs,
            matchedIds: [],
            selectedPair: null,
            isAnswered: false
        };
    } else if (quizType === 'fill_blank') {
        let questionItem = null;
        const nextFillId = (AppState.fillBlankQueueIds || []).shift();
        if (nextFillId) questionItem = AppState.cachedWords.find(w => w.id === nextFillId) || null;
        // Ensure the example actually contains the target word; otherwise blank can't be rendered
        if (questionItem && !exampleContainsWord(questionItem)) questionItem = null;

        if (!questionItem) {
            AppState.quizFlowPhase = 'multiple_choice';
            return nextQuestion();
        }
        
        // Tạo distractors - CHỈ lấy từ CÙNG NGÔN NGỮ trong filteredPool
        const distractors = filteredPool
            .filter(x => x.id !== questionItem.id && x.l === questionItem.l)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3)
            .map(x => x.w);
        
        const options = [questionItem.w, ...distractors].sort(() => 0.5 - Math.random());

        qData = {
            type: 'fill_blank',
            correct: questionItem,
            options: options,
            selectedWord: null,
            isAnswered: false
        };
    } else {
        // MULTIPLE CHOICE (MẶC ĐỊNH)
        ensureMultipleChoiceRound(currentFilter, filteredPool, filteredDue);
        if ((AppState.mcRoundQueueIds || []).length === 0) {
            if ((AppState.mcRoundCorrectIds || []).length >= 6) {
                AppState.matchWordsWordIds = AppState.mcRoundCorrectIds.slice(0, 6);
                AppState.quizFlowPhase = 'match_words';
                return nextQuestion();
            }
            if (!AppState.isCramMode) {
                showDoneArea();
                let rawWords = [...new Set(AppState.quizHistory.map(q => q.correct))].filter(Boolean);
                if (rawWords.length === 0) {
                    rawWords = AppState.cachedWords.filter(w => (w.level || 0) > 0 && (currentFilter === 'ALL' ? true : w.l === currentFilter));
                }
                generateAIQuestions(rawWords);
                return;
            }
        }

        let questionItem;
        const nextId = AppState.mcRoundQueueIds.shift();
        if (nextId) {
            questionItem = AppState.cachedWords.find(w => w.id === nextId);
        } else {
            return nextQuestion();
        }
        if (!questionItem) return showEmpty();

        // CHỈ lấy pool các từ cùng ngôn ngữ với câu hỏi để trắc nghiệm không bị "lạc quẻ"
        const pool = AppState.cachedWords.filter(x => x.l === questionItem.l);
        const distractors = [];
        const usedMeanings = new Set([questionItem.m.trim().toLowerCase()]);
        const shuffledPool = pool.filter(x => x.id !== questionItem.id).sort(() => 0.5 - Math.random());

        for (const item of shuffledPool) {
            const m = item.m.trim().toLowerCase();
            if (!usedMeanings.has(m)) {
                usedMeanings.add(m);
                distractors.push(item);
            }
            if (distractors.length === 3) break;
        }

        if (distractors.length < 3) {
            const extra = shuffledPool.filter(x => !distractors.includes(x)).slice(0, 3 - distractors.length);
            distractors.push(...extra);
        }
        const options = [questionItem, ...distractors].sort(() => 0.5 - Math.random());

        qData = { type: 'multiple_choice', correct: questionItem, options: options, selectedId: null, isAnswered: false };
    }

    if (quizType === 'done') {
        showDoneArea();
        return;
    }

    AppState.quizHistory.push(qData);
    AppState.historyIndex++;

    document.getElementById('doneArea').style.display = 'none';
    document.getElementById('quizArea').style.display = 'block';
    document.getElementById('emptyArea').style.display = 'none';
    renderQuestion(qData);
}

export function prevQuestion() {
    if (AppState.historyIndex > 0) {
        AppState.historyIndex--;
        renderQuestion(AppState.quizHistory[AppState.historyIndex]);
    }
}

export function renderQuestion(q) {
    // Reset Visibility
    document.getElementById('modeMultipleChoice').style.display = 'none';
    document.getElementById('modeMatchWords').style.display = 'none';
    document.getElementById('modeFillBlank').style.display = 'none';
    document.getElementById('qMsg').innerText = '';
    document.getElementById('btnNext').style.visibility = (q.isAnswered && q.type !== 'match_words' ) ? 'visible' : 'hidden'; // MatchWords tự nhảy nên ko cần Next trừ khi xong
    document.getElementById('sm2Actions').style.display = 'none';
    document.getElementById('btnPrev').disabled = (AppState.historyIndex <= 0);

    if (q.type === 'match_words') {
        renderMatchWords(q);
    } else if (q.type === 'fill_blank') {
        renderFillBlank(q);
    } else {
        renderMultipleChoice(q);
    }
}

function renderMultipleChoice(q) {
    document.getElementById('modeMultipleChoice').style.display = 'block';
    AppState.currentQuizItem = q.correct;
    document.getElementById('qWord').innerText = q.correct.w;

    const hintArea = document.getElementById('aiHintArea');
    if (hintArea) { hintArea.style.display = 'none'; hintArea.innerHTML = ''; }

    const phoneticEl = document.getElementById('qPhonetic');
    phoneticEl.innerText = q.correct.p || "(Chưa có phiên âm)";
    q.isAnswered ? phoneticEl.classList.add('revealed') : phoneticEl.classList.remove('revealed');

    const exEl = document.getElementById('qex');
    if (q.correct.ex) {
        exEl.innerText = `📝 ${q.correct.ex}`;
        exEl.style.display = q.isAnswered ? 'block' : 'none';
    } else {
        exEl.style.display = 'none';
    }

    const grid = document.getElementById('qOptions');
    grid.innerHTML = '';

    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.innerText = opt.m;
        btn.setAttribute('data-id', opt.id);

        if (q.isAnswered) {
            btn.disabled = true;
            if (opt.id === q.correct.id) btn.classList.add('correct');
            if (opt.id === q.selectedId && q.selectedId !== q.correct.id) btn.classList.add('wrong');
        }
        grid.appendChild(btn);
    });

    if (q.isAnswered) {
        if (q.selectedId === q.correct.id && !AppState.isCramMode) {
            document.getElementById('sm2Actions').style.display = 'flex';
            document.getElementById('btnNext').style.visibility = 'hidden';
        } else {
            document.getElementById('btnNext').style.visibility = 'visible';
        }
        document.getElementById('qMsg').innerHTML = (q.selectedId === q.correct.id) ? "<span style='color:var(--success)'>Chính xác! 🎉</span>" : "<span style='color:var(--danger)'>Sai rồi!</span>";
    }
}

function renderMatchWords(q) {
    document.getElementById('modeMatchWords').style.display = 'block';
    const grid = document.getElementById('matchGrid');
    grid.innerHTML = '';

    q.pairs.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'match-card';
        card.innerText = item.text;
        card.setAttribute('data-id', item.id);
        card.setAttribute('data-type', item.type);
        card.setAttribute('data-index', index);

        if (q.matchedIds.includes(item.id)) {
            card.classList.add('matched');
        } else if (q.selectedPair && q.selectedPair.index == index) {
            card.classList.add('selected');
        }

        grid.appendChild(card);
    });

    if (q.isAnswered) {
        document.getElementById('qMsg').innerHTML = "<span style='color:var(--success)'>Đã hoàn thành ghép cặp! 🎉</span>";
        document.getElementById('btnNext').style.visibility = 'visible';
    }
}

function renderFillBlank(q) {
    document.getElementById('modeFillBlank').style.display = 'block';
    AppState.currentQuizItem = q.correct;
    
    // Câu đục lỗ
    const sentenceEl = document.getElementById('fbSentence');
    const wordRegex = getFillBlankRegex(q.correct);
    if (!wordRegex) {
        // Should never happen, but avoid runtime errors
        sentenceEl.innerHTML = `"${q.correct.ex || ''}"`;
        return;
    }

    const hasMatch = wordRegex.test(q.correct.ex);
    // Reset lastIndex after test() with /g
    wordRegex.lastIndex = 0;

    // Fallback: if no match, show a clear blank at the start (rare, but avoids “no blank” bug)
    const baseSentence = hasMatch ? q.correct.ex : `____ ${q.correct.ex}`;

    const displaySentence = baseSentence.replace(wordRegex, (match) => {
        const text = q.isAnswered ? match : (q.selectedWord || '');
        return `<span class="blank-box ${q.isAnswered ? 'filled' : ''}">${text}</span>`;
    });
    // Tạm thời comment lại phần hiển thị nghĩa theo yêu cầu
    // sentenceEl.innerHTML = `"${displaySentence}"<br><small style="color:#64748b; font-weight:normal; font-style:italic">(${q.correct.m})</small>`;
    sentenceEl.innerHTML = `"${displaySentence}"`;

    // Options
    const optContainer = document.getElementById('fbOptions');
    optContainer.innerHTML = '';
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = `fb-pill ${q.selectedWord === opt ? 'used' : ''}`;
        btn.innerText = opt;
        btn.disabled = q.isAnswered;
        optContainer.appendChild(btn);
    });

    if (q.isAnswered) {
        const isCorrect = q.selectedWord.toLowerCase() === q.correct.w.toLowerCase();
        document.getElementById('qMsg').innerHTML = isCorrect 
            ? "<span style='color:var(--success)'>Chính xác! 🎉</span>" 
            : `<span style='color:var(--danger)'>Sai rồi! Đáp án là: <b>${q.correct.w}</b></span>`;
        
        if (isCorrect && !AppState.isCramMode) {
            document.getElementById('sm2Actions').style.display = 'flex';
            document.getElementById('btnNext').style.visibility = 'hidden';
        } else {
            document.getElementById('btnNext').style.visibility = 'visible';
        }
    }
}

export function handleAnswer(btn, selected, correct) {
    const currentQuestion = AppState.quizHistory[AppState.historyIndex];
    currentQuestion.selectedId = selected.id;
    currentQuestion.isAnswered = true;

    document.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
    document.getElementById('btnNext').style.visibility = 'visible';
    document.getElementById('qPhonetic').classList.add('revealed');

    if (correct.ex) document.getElementById('qex').style.display = 'block';

    speakText(correct.w, correct.l);

    const isCorrect = (selected.id === correct.id);
    if (isCorrect) {
        if (currentQuestion?.type === 'multiple_choice') {
            const exists = AppState.mcRoundCorrectIds.includes(correct.id);
            if (!exists) {
                AppState.mcRoundCorrectIds.push(correct.id);
            }
            if (exampleContainsWord(correct)) {
                AppState.fillBlankQueueIds = [correct.id];
                AppState.quizFlowPhase = 'fill_blank';
            } else {
                AppState.quizFlowPhase = 'multiple_choice';
            }
        }
        btn.classList.add('correct');
        document.getElementById('qMsg').innerHTML = "<span style='color:var(--success)'>Chính xác! 🎉 Chọn mức độ nhớ:</span>";
        if (!AppState.isCramMode) {
            document.getElementById('btnNext').style.visibility = 'hidden';
            document.getElementById('sm2Actions').style.display = 'flex';
        } else {
            document.getElementById('btnNext').style.visibility = 'visible';
        }
    } else {
        btn.classList.add('wrong');
        document.querySelectorAll('.opt-btn').forEach(b => { if (b.innerText === correct.m) b.classList.add('correct'); });
        document.getElementById('qMsg').innerHTML = "<span style='color:var(--danger)'>Sai rồi!</span>";
        document.getElementById('btnNext').style.visibility = 'visible';
        document.getElementById('sm2Actions').style.display = 'none';
        if (currentQuestion?.type === 'multiple_choice') AppState.quizFlowPhase = 'multiple_choice';
        // Sai => Đặt lại Interval=1, Level=0, EF=2.5 (hoặc EF cũ mượn tạm)
        let oldEF = correct.easeFactor !== undefined ? correct.easeFactor : 2.5;
        let newEF = Math.max(1.3, oldEF - 0.2); // Tùy chỉnh phạt EF khi sai
        if (!AppState.isCramMode) updateWordSRS(correct.id, 0, Date.now() + 86400000, newEF, 1);
    }
}

export async function handleSM2Rating(quality) {
    if (!AppState.currentQuizItem) return;
    const word = AppState.currentQuizItem;

    // Thuật toán cốt lõi SM-2
    let easeFactor = word.easeFactor !== undefined ? word.easeFactor : 2.5;
    let interval = word.interval !== undefined ? word.interval : 0;
    let level = word.level !== undefined ? word.level : 0;

    // Tính EF mới
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    easeFactor = Math.max(1.3, easeFactor); // Không bao giờ tụt dưới 1.3

    if (quality < 3) {
        // Trả lời sai/nhớ kém -> Trở về vạch xuất phát
        level = 0;
        interval = 1;
    } else {
        // Nhớ được
        if (level === 0) {
            interval = 1;
        } else if (level === 1) {
            interval = 6;
        } else {
            interval = Math.round(interval * easeFactor);
        }
        level++;
    }

    const nextReview = Date.now() + (interval * 24 * 60 * 60 * 1000);

    // Gọi updateWordSRS (không dùng await để tránh nghẽn luồng)
    updateWordSRS(word.id, level, nextReview, easeFactor, interval);

    // Count as a completed session item (only for due-mode, not cram)
    if (!AppState.isCramMode) {
        resetStudySessionIfNeeded(false);
        if (!AppState.sessionSeenIds.has(word.id)) {
            AppState.sessionSeenIds.add(word.id);
            AppState.sessionDoneCount = (AppState.sessionDoneCount || 0) + 1;
        }
    }

    // Bỏ khóa nút vì chuyển trang luôn rồi
    nextQuestion(); // Tự động nhảy sang câu sau
}

export async function updateWordSRS(id, newLevel, newNextReview, newEaseFactor, newInterval) {
    // Cập nhật RAM & UI NGAY LẬP TỨC để mượt
    const wordInRam = AppState.cachedWords.find(w => w.id === id);
    if (wordInRam) {
        wordInRam.level = newLevel;
        wordInRam.nextReview = newNextReview;
        wordInRam.easeFactor = newEaseFactor;
        wordInRam.interval = newInterval;
    }
    updateSRSStatus();

    // Gửi dữ liệu về backend ngầm
    try {
        await updateWordSRSToBackend(id, newLevel, newNextReview, newEaseFactor, newInterval, wordInRam || null);
    } catch (error) { console.error("Lỗi đồng bộ SRS", error); }
}

export function handleMatchClick(card, id, type, index) {
    const qData = AppState.quizHistory[AppState.historyIndex];
    if (qData.isAnswered || card.classList.contains('matched')) return;

    // PHÁT AUDIO NGAY LẬP TỨC KHI CHẠM (Không delay)
    // Dù là thẻ từ hay thẻ nghĩa, đều phát âm thanh của từ đó để phản hồi nhanh
    const wordObj = AppState.cachedWords.find(w => w.id === id);
    if (wordObj) {
        // Dùng rate 1.1 để nghe lẹ và nhạy hơn trong trò chơi nối từ
        speakText(wordObj.w, wordObj.l, "", 1.1); 
    }

    // Nếu bấm lại thẻ cũ thì bỏ chọn
    if (qData.selectedPair && qData.selectedPair.index == index) {
        qData.selectedPair = null;
        renderQuestion(qData);
        return;
    }

    if (!qData.selectedPair) {
        // Chọn thẻ thứ nhất
        qData.selectedPair = { id, type, index, el: card };
        renderQuestion(qData);
    } else {
        // Chọn thẻ thứ hai -> Kiểm tra match
        const first = qData.selectedPair;
        if (first.id === id && first.type !== type) {
            // MATCH!
            qData.matchedIds.push(id);
            qData.selectedPair = null;
            
            // (Đã phát audio ở đầu hàm nên không cần gọi lại ở đây nữa)
            
            // Kiểm tra xem đã hết chưa
            const totalPairs = qData.pairs.length / 2;
            if (qData.matchedIds.length === totalPairs) {
                qData.isAnswered = true;
                // Cộng điểm SRS ngầm cho cả 4 từ (tự động cộng "Dễ")
                qData.matchedIds.forEach(matchId => {
                    const word = AppState.cachedWords.find(w => w.id === matchId);
                    if (word) {
                        let easeFactor = word.easeFactor || 2.5;
                        let interval = word.interval || 0;
                        let level = word.level || 0;
                        if (level === 0) interval = 1; else if (level === 1) interval = 6; else interval = Math.round(interval * (easeFactor+0.1));
                        level++;
                        const nextReview = Date.now() + (interval * 24 * 60 * 60 * 1000);
                        updateWordSRS(matchId, level, nextReview, easeFactor + 0.1, interval);
                    }
                });
            }
            renderQuestion(qData);
        } else {
            // SAI -> Đưa vào danh sách ôn tập (Phạt SRS)
            card.classList.add('wrong');
            first.el.classList.add('wrong');

            if (!AppState.isCramMode) {
                [first.id, id].forEach(wordId => {
                    const word = AppState.cachedWords.find(w => w.id === wordId);
                    if (word) {
                        let oldEF = word.easeFactor || 2.5;
                        updateWordSRS(wordId, 0, Date.now() + 86400000, Math.max(1.3, oldEF - 0.2), 1);
                    }
                });
            }

            qData.selectedPair = null;
            setTimeout(() => {
                renderQuestion(qData);
            }, 500);
        }
    }
}

export function handleFillBlankOptionClick(word) {
    const qData = AppState.quizHistory[AppState.historyIndex];
    if (qData.isAnswered) return;

    qData.selectedWord = word;
    qData.isAnswered = true;
    
    const isCorrect = word.toLowerCase() === qData.correct.w.toLowerCase();
    
    if (isCorrect) {
        speakText(qData.correct.w, qData.correct.l, qData.correct.ex);
    } else {
        // Sai thì phạt SRS
        if (!AppState.isCramMode) {
            let oldEF = qData.correct.easeFactor || 2.5;
            updateWordSRS(qData.correct.id, 0, Date.now() + 86400000, Math.max(1.3, oldEF - 0.2), 1);
        }
    }
    
    renderQuestion(qData);
}

export function forceReviewMode() { AppState.isCramMode = true; nextQuestion(); }
