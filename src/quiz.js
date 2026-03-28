// src/quiz.js
import { AppState } from './config.js';
import { speakText } from './utils.js';
import { generateAIQuestions } from './ai-services.js';
import { updateWordSRSToBackend } from './api.js';
import { renderList } from './ui.js';

export function updateSRSStatus() {
    if (!AppState.currentUser) return;
    const now = Date.now();
    const filter = document.getElementById('quizFilter').value;
    let pool = filter === 'ALL' ? AppState.cachedWords : AppState.cachedWords.filter(w => w.l === filter);

    AppState.dueWords = pool.filter(w => (w.nextReview || 0) <= now).sort((a, b) => a.nextReview - b.nextReview);
    document.getElementById('reviewStatus').innerHTML = AppState.dueWords.length > 0
        ? `Cần ôn: <b class="due-badge">${AppState.dueWords.length}</b> từ`
        : `<span style="color:var(--success)">Đã học xong!</span>`;

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
    nextQuestion();
}

export function showEmpty() {
    document.getElementById('quizArea').style.display = 'none';
    document.getElementById('emptyArea').style.display = 'block';
}

export function nextQuestion() {
    if (!AppState.currentUser) return;
    if (AppState.historyIndex < AppState.quizHistory.length - 1) {
        AppState.historyIndex++; renderQuestion(AppState.quizHistory[AppState.historyIndex]); return;
    }
    updateSRSStatus();
    let questionItem;
    if (AppState.dueWords.length > 0) {
        AppState.isCramMode = false;
        const topN = AppState.dueWords.slice(0, 10);
        questionItem = topN[Math.floor(Math.random() * topN.length)];
    } else {
        if (!AppState.isCramMode) {
            document.getElementById('quizArea').style.display = 'none';
            document.getElementById('doneArea').style.display = 'block';
            document.getElementById('emptyArea').style.display = 'none';

            let rawWords = [...new Set(AppState.quizHistory.map(q => q.correct))];
            if (rawWords.length === 0) {
                const currentFilter = document.getElementById('quizFilter').value;
                rawWords = AppState.cachedWords.filter(w => (w.level || 0) > 0 && (currentFilter === 'ALL' ? true : w.l === currentFilter));
            }
            generateAIQuestions(rawWords);
            return;

        } else {
            const pool = document.getElementById('quizFilter').value === 'ALL' ? AppState.cachedWords : AppState.cachedWords.filter(x => x.l === document.getElementById('quizFilter').value);
            if (pool.length < 4) return showEmpty();
            questionItem = pool[Math.floor(Math.random() * pool.length)];
        }
    }
    if (!questionItem) return showEmpty();

    const pool = document.getElementById('quizFilter').value === 'ALL' ? AppState.cachedWords : AppState.cachedWords.filter(x => x.l === document.getElementById('quizFilter').value);
    if (pool.length < 4) return showEmpty();

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

    // Fallback trong trường hợp đặc biệt không đủ từ có nghĩa khác nhau
    if (distractors.length < 3) {
        const extra = shuffledPool.filter(x => !distractors.includes(x)).slice(0, 3 - distractors.length);
        distractors.push(...extra);
    }
    const options = [questionItem, ...distractors].sort(() => 0.5 - Math.random());

    const qData = { correct: questionItem, options: options, selectedId: null, isAnswered: false };
    AppState.quizHistory.push(qData); AppState.historyIndex++;

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
    AppState.currentQuizItem = q.correct;
    document.getElementById('qWord').innerText = q.correct.w;

    const hintArea = document.getElementById('aiHintArea');
    if (hintArea) {
        hintArea.style.display = 'none';
        hintArea.innerHTML = '';
    }

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
    grid.innerHTML = ''; document.getElementById('qMsg').innerText = '';

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

    document.getElementById('btnPrev').disabled = (AppState.historyIndex <= 0);
    document.getElementById('sm2Actions').style.display = 'none';

    if (q.isAnswered) {
        if (q.selectedId === q.correct.id && !AppState.isCramMode) {
            document.getElementById('sm2Actions').style.display = 'flex';
            document.getElementById('btnNext').style.visibility = 'hidden';
        } else {
            document.getElementById('btnNext').style.visibility = 'visible';
            document.getElementById('sm2Actions').style.display = 'none';
        }
        document.getElementById('qMsg').innerHTML = (q.selectedId === q.correct.id) ? "<span style='color:var(--success)'>Chính xác! 🎉</span>" : "<span style='color:var(--danger)'>Sai rồi!</span>";
    } else { document.getElementById('btnNext').style.visibility = 'hidden'; }
}

export function handleAnswer(btn, selected, correct) {
    AppState.quizHistory[AppState.historyIndex].selectedId = selected.id;
    AppState.quizHistory[AppState.historyIndex].isAnswered = true;

    document.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
    document.getElementById('btnNext').style.visibility = 'visible';
    document.getElementById('qPhonetic').classList.add('revealed');

    if (correct.ex) document.getElementById('qex').style.display = 'block';

    speakText(correct.w, correct.l);

    const isCorrect = (selected.id === correct.id);
    if (isCorrect) {
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
        await updateWordSRSToBackend(id, newLevel, newNextReview, newEaseFactor, newInterval);
    } catch (error) { console.error("Lỗi đồng bộ SRS", error); }
}

export function forceReviewMode() { AppState.isCramMode = true; nextQuestion(); }
