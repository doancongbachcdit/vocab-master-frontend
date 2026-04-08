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
    
    const currentFilter = document.getElementById('quizFilter').value;
    const filteredPool = currentFilter === 'ALL' ? AppState.cachedWords : AppState.cachedWords.filter(w => w.l === currentFilter);
    const filteredDue = currentFilter === 'ALL' ? AppState.dueWords : AppState.dueWords.filter(w => w.l === currentFilter);

    // Chọn ngẫu nhiên loại Quiz dựa trên kho từ đã lọc
    const types = ['multiple_choice'];
    if (filteredPool.length >= 4) types.push('match_words');
    
    const wordsWithEx = filteredPool.filter(w => w.ex && w.ex.trim().length > 0);
    if (wordsWithEx.length > 0) types.push('fill_blank');

    const quizType = types[Math.floor(Math.random() * types.length)];

    let qData;

    if (quizType === 'match_words') {
        // Ưu tiên lấy từ đến hạn (dueWords) trong pool đã lọc
        let sourcePool = filteredDue.length >= 4 ? filteredDue : filteredPool;
        
        // Match Words thì luôn cùng ngôn ngữ (đã được filteredPool đảm bảo nếu Filter != ALL)
        // Nếu Filter == ALL, ta vẫn nên lọc theo 1 ngôn ngữ nhất định cho vòng này để tránh lộn xộn
        const firstWord = sourcePool[Math.floor(Math.random() * sourcePool.length)];
        const finalPool = sourcePool.filter(w => w.l === firstWord.l);
        
        // Fallback nếu không đủ 4 từ cùng loại trong sourcePool
        const backupPool = finalPool.length >= 4 ? finalPool : AppState.cachedWords.filter(w => w.l === firstWord.l);

        const targetWords = backupPool.sort(() => 0.5 - Math.random()).slice(0, 4);
        
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
        const questionItem = wordsWithEx[Math.floor(Math.random() * wordsWithEx.length)];
        
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

                let rawWords = [...new Set(AppState.quizHistory.map(q => q.correct))].filter(Boolean);
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
    const wordRegex = new RegExp(`\\b${q.correct.w}\\b`, 'gi');
    const displaySentence = q.correct.ex.replace(wordRegex, (match) => {
        const text = q.isAnswered ? match : (q.selectedWord || '');
        return `<span class="blank-box ${q.isAnswered ? 'filled' : ''}">${text}</span>`;
    });
    sentenceEl.innerHTML = `"${displaySentence}"<br><small style="color:#64748b; font-weight:normal; font-style:italic">(${q.correct.m})</small>`;

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
            // SAI
            card.classList.add('wrong');
            first.el.classList.add('wrong');
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
