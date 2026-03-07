import { AppState } from './config.js';
import { speakText } from './utils.js';
import { updateWordSRS } from './quiz.js';

let currentDictationItem = null;
const synth = window.speechSynthesis;
let currentUtterance = null;
let isPlaying = false;

export function loadRandomDictation() {
    const dictationArea = document.getElementById('dictationTab');
    if (!AppState.cachedWords || AppState.cachedWords.length === 0) {
        dictationArea.innerHTML = `<p style="text-align:center; padding: 20px;">Bạn chưa có từ vựng nào trong kho dữ liệu. Vui lòng sang tab Dữ Liệu để thêm!</p>`;
        return;
    }

    // Luôn render Dropdown Lọc Ngôn Ngữ nếu nó chưa tồn tại trên giao diện Dictation
    let dictationFilterHtml = '';
    const existingFilter = document.getElementById('dictFilter');
    let currentFilterValue = existingFilter ? existingFilter.value : 'ALL';

    dictationFilterHtml = `
        <div class="srs-info" style="margin-bottom: 20px;">
            <span id="dictReviewStatus" style="font-weight: bold; color: var(--primary);"></span>
            <select id="dictFilter" style="width:auto; padding:5px; margin:0; font-size:0.9em">
                <option value="ALL" ${currentFilterValue === 'ALL' ? 'selected' : ''}>Tất cả</option>
                <option value="EN" ${currentFilterValue === 'EN' ? 'selected' : ''}>Tiếng Anh</option>
                <option value="CN" ${currentFilterValue === 'CN' ? 'selected' : ''}>Tiếng Trung</option>
            </select>
        </div>
    `;

    // Lọc các từ ưu tiên (Due Words) có câu ví dụ (ex) theo Filter
    let validWords = AppState.dueWords.filter(w => {
        if (!w.ex || w.ex.trim() === '') return false;
        if (currentFilterValue !== 'ALL' && w.l !== currentFilterValue) return false;
        return true;
    });

    // Nếu hết từ ưu tiên, lấy ngẫu nhiên từ toàn bộ kho từ vựng theo Filter
    if (validWords.length === 0) {
        validWords = AppState.cachedWords.filter(w => {
            if (!w.ex || w.ex.trim() === '') return false;
            if (currentFilterValue !== 'ALL' && w.l !== currentFilterValue) return false;
            return true;
        });
    }

    if (validWords.length === 0) {
        dictationArea.innerHTML = `
            ${dictationFilterHtml}
            <p style="text-align:center; padding: 20px;">Không tìm thấy câu ví dụ nào khớp với bộ lọc Ngôn Ngữ hiện tại. Hãy chọn ngôn ngữ khác hoặc thêm nội dung mới nhé!</p>
        `;

        // Cài đặt lại sự kiện select cho Dropdown lỗi
        const fallbackFilter = document.getElementById('dictFilter');
        if (fallbackFilter) fallbackFilter.addEventListener('change', loadRandomDictation);

        return;
    }

    // Chọn ngẫu nhiên 1 câu
    const randomIndex = Math.floor(Math.random() * validWords.length);
    currentDictationItem = validWords[randomIndex];

    // Tạo giao diện
    dictationArea.innerHTML = `
        ${dictationFilterHtml}
        <div class="card" style="margin-bottom: 20px; transition: transform 0.2s;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0;">🎧 Băng Cát-Xét (Chép Chính Tả)</h3>
                <span style="font-size: 0.85em; color: #64748b; background: #e2e8f0; padding: 4px 8px; border-radius: 4px;">Tới hạn ôn tập</span>
            </div>
            
            <p style="color: #64748b; font-size: 0.9em; margin-top: -10px; margin-bottom: 15px;">Nghe đoạn văn sau và gõ lại. Nếu có từ mới, nhấn đúp chuột (Double Click) vào từ đó ở phần Kết quả để lưu tự động.</p>
            
            <div id="originalSentence" style="display: none;">${currentDictationItem.ex}</div>
            
            <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-bottom: 20px; background: #f1f5f9; padding: 15px; border-radius: 8px;">
                <button class="btn btn-primary" id="btnPlayDict" style="margin: 0;">▶️ Phát Audio (Normal)</button>
                <button class="btn btn-outline" id="btnSlowDict" style="margin: 0; background: #e2e8f0; color: #333; border: none;">🐢 Phát Chậm (0.75x)</button>
                <button class="btn btn-outline" id="btnSkipDict" style="margin: 0; background: #fee2e2; color: #dc2626; border: none;">⏭️ Bỏ qua câu này</button>
            </div>

            <div style="margin-bottom: 20px;">
                <textarea id="userInputDict" placeholder="Gõ lại những gì bạn nghe được vào đây..." style="width: 100%; height: 120px; padding: 15px; border: 2px solid #cbd5e1; border-radius: 8px; font-size: 1.1em; resize: vertical; box-sizing: border-box;"></textarea>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                <button class="btn btn-success" id="btnCheckDict" style="padding: 12px 30px; font-size: 1.1em; font-weight: bold; margin: 0; border: none;">✅ Kiểm tra (Check & Diff)</button>
            </div>

            <div id="resultAreaDict" style="display: none; margin-top: 20px; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 1.1em; line-height: 1.8;">
                <div style="font-size: 0.9em; color: #64748b; font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">Kết quả:</div>
                <div id="diffOutputDict"></div>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
                    <p style="font-size: 0.9em; margin: 0 0 5px 0;">Từ vựng chính trong câu này:</p>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: bold; color: var(--primary); font-size: 1.2em;">${currentDictationItem.w}</span>
                        <span style="color: #64748b;">${currentDictationItem.p || ''}</span>
                        <span>- ${currentDictationItem.m}</span>
                    </div>
                </div>
            </div>

            <div style="margin-top: 20px; font-size: 0.85em; color: #64748b; text-align: center;">
                <p><b>Phím tắt:</b> Bấm <kbd style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; border: 1px solid #cbd5e1;">Ctrl</kbd> + <kbd style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; border: 1px solid #cbd5e1;">Space</kbd> để Phát / Tạm dừng audio. Bấm <kbd style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; border: 1px solid #cbd5e1;">Enter</kbd> (khi đang giữ Ctrl) để Check.</p>
            </div>
        </div>
    `;

    // Gắn sự kiện
    document.getElementById("dictFilter").addEventListener("change", loadRandomDictation);
    document.getElementById("btnPlayDict").addEventListener("click", () => playDictationAudio(1.0));
    document.getElementById("btnSlowDict").addEventListener("click", () => playDictationAudio(0.75));
    document.getElementById("btnCheckDict").addEventListener("click", checkDictationTarget);
    document.getElementById("btnSkipDict").addEventListener("click", loadRandomDictation);

    // Update Text Review số lượng
    const dueCount = AppState.dueWords.filter(w => w.ex && w.ex.trim() !== '' && (currentFilterValue === 'ALL' || w.l === currentFilterValue)).length;
    document.getElementById("dictReviewStatus").innerHTML = dueCount > 0 ? `Cần nghe: <b class="due-badge">${dueCount}</b> câu` : `<span style="color:var(--success)">Đã luyện nghe xong hôm nay!</span>`;

    // Auto focus and play
    setTimeout(() => {
        document.getElementById("userInputDict")?.focus();
        playDictationAudio(1.0);
    }, 300);
}

export function playDictationAudio(rate = 1.0) {
    if (!currentDictationItem) return;
    synth.cancel();

    currentUtterance = new SpeechSynthesisUtterance(currentDictationItem.ex);
    // Sử dụng mã ngôn ngữ tuỳ theo từ vựng hiện tại (EN = en-US, CN = zh-CN)
    currentUtterance.lang = currentDictationItem.l === 'CN' ? 'zh-CN' : 'en-US';
    currentUtterance.rate = rate;

    currentUtterance.onstart = () => isPlaying = true;
    currentUtterance.onend = () => isPlaying = false;

    synth.speak(currentUtterance);
}

export function checkDictationTarget() {
    if (!currentDictationItem) return;
    const userInput = document.getElementById("userInputDict");
    const diffOutput = document.getElementById("diffOutputDict");
    const resultArea = document.getElementById("resultAreaDict");

    if (!userInput || !diffOutput || !resultArea) return;

    const originalText = currentDictationItem.ex;

    // Tách từ thông minh hỗ trợ cả Tiếng Anh (khoảng trắng) và Tiếng Trung (tự tách từng chữ hán nếu cần)
    let origWords = [];
    let userWords = [];

    if (currentDictationItem.l === 'CN') {
        // Với Tiếng Trung, cắt thành từng ký tự một (loại bỏ khoảng trắng thừa)
        origWords = originalText.trim().replace(/\s+/g, "").split('');
        userWords = userInput.value.trim().replace(/\s+/g, "").split('');
    } else {
        // Với Tiếng Anh, giữ nguyên cách chia tách bằng khoảng trắng
        origWords = originalText.trim().split(/\s+/);
        userWords = userInput.value.trim().split(/\s+/);
    }

    let htmlResult = "";
    const maxLength = Math.max(origWords.length, userWords.length);

    for (let i = 0; i < maxLength; i++) {
        let origW = origWords[i] || "";
        let userW = userWords[i] || "";

        let cleanOrig = origW.replace(/[.,!?]/g, "").toLowerCase();
        let cleanUser = userW.replace(/[.,!?]/g, "").toLowerCase();

        let wordSpan = `<span class="word-clickable" style="cursor: pointer; transition: 0.2s; display: inline-block; padding: 0 2px;" onmouseover="this.style.background='#fef08a'; this.style.borderRadius='4px';" onmouseout="this.style.background='transparent';" ondblclick="handleDoubleClickDictation('${origW.replace(/['"]/g, "")}')">`;

        if (cleanOrig === cleanUser && cleanOrig !== "") {
            htmlResult += `${wordSpan}<span style="color: #16a34a; font-weight: bold; background: #dcfce7; padding: 2px 4px; border-radius: 4px;">${origW}</span></span> `;
        } else if (cleanUser !== "") {
            htmlResult += `<span style="color: #dc2626; text-decoration: line-through; background: #fee2e2; padding: 2px 4px; border-radius: 4px; margin-right: 5px;">${userW}</span>`;
            if (origW !== "") {
                htmlResult += `${wordSpan}<span style="color: #16a34a; font-weight: bold;">${origW}</span></span> `;
            } else {
                htmlResult += ` `;
            }
        } else {
            htmlResult += `${wordSpan}<span style="color: #94a3b8; border-bottom: 2px dashed #94a3b8; padding: 0 4px;">${origW}</span></span> `;
        }
    }

    // Phase 3: Kiểm tra xem Bách có gõ đúng từ cần học (currentDictationItem) không
    const cleanTargetWord = currentDictationItem.w.replace(/[.,!?;:。，！？]/g, "").toLowerCase();

    let isTargetCorrect = false;
    if (currentDictationItem.l === 'CN') {
        // Tiếng Trung: ghép lại chuỗi của người dùng rồi tìm chuỗi con
        const userFullText = userInput.value.trim().replace(/[.,!?;:。，！？\s]/g, "").toLowerCase();
        isTargetCorrect = userFullText.includes(cleanTargetWord);
    } else {
        // Tiếng Anh: Tìm kiếm từng từ
        isTargetCorrect = userWords.some(w => w.replace(/[.,!?;:。，！？]/g, "").toLowerCase() === cleanTargetWord);
    }

    let srsMessage = "";
    if (isTargetCorrect) {
        srsMessage = `<div style="margin-top: 15px; padding: 10px; background: #dcfce7; border: 1px solid #22c55e; border-radius: 8px; color: #16a34a; font-weight: bold;">
            🚀 Xuất sắc! Bạn đã nghe và gõ trúng từ cốt lõi "${currentDictationItem.w}". Đã tự động cộng điểm SRS!
        </div>`;

        // Tính toán EF và NextReview tương đương với việc đánh giá "Dễ/Vừa" trong Quiz
        let easeFactor = currentDictationItem.easeFactor !== undefined ? currentDictationItem.easeFactor : 2.5;
        let interval = currentDictationItem.interval !== undefined ? currentDictationItem.interval : 0;
        let level = currentDictationItem.level !== undefined ? currentDictationItem.level : 0;

        if (level === 0) interval = 1;
        else if (level === 1) interval = 6;
        else interval = Math.round(interval * easeFactor);
        level++;

        const nextReview = Date.now() + (interval * 24 * 60 * 60 * 1000);

        // Gọi hàm của Quiz để Update Firebase DB (Chạy ngầm)
        updateWordSRS(currentDictationItem.id, level, nextReview, easeFactor, interval);

    } else {
        srsMessage = `<div style="margin-top: 15px; padding: 10px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; color: #dc2626;">
            ❌ Bạn đã gõ sai (hoặc thiếu) từ cốt lõi "${currentDictationItem.w}". Cố gắng ở câu tiếp theo nhé!
        </div>`;
    }

    // Render lại toàn bộ Area với Diff + Thông báo thành tích
    resultArea.innerHTML = `
        <div style="font-size: 0.9em; color: #64748b; font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">Kết quả:</div>
        <div id="diffOutputDict">${htmlResult}</div>
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
            <p style="font-size: 0.9em; margin: 0 0 5px 0;">Từ vựng chính trong câu này:</p>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: bold; color: var(--primary); font-size: 1.2em;">${currentDictationItem.w}</span>
                <span style="color: #64748b;">${currentDictationItem.p || ''}</span>
                <span>- ${currentDictationItem.m}</span>
            </div>
        </div>
        ${srsMessage}
    `;

    resultArea.style.display = "block";
}

// Global click to save feature mockup
window.handleDoubleClickDictation = function (word) {
    const cleanWord = word.replace(/[.,!?;:。，！？]/g, "");
    document.getElementById('inpWord').value = cleanWord;
    document.getElementById('inpLang').value = currentDictationItem ? currentDictationItem.l : 'EN';
    window.switchTab('data');
    document.getElementById('btnAutoFill').click();

    setTimeout(() => {
        alert(`🚀 Đã chuyển sang tab Dữ Liệu và tự động điền từ: "${cleanWord}"\nAI đang dịch nghĩa cho Bách...`);
    }, 300);
};

export function handleDictationKeydown(e) {
    const dictTab = document.getElementById('dictation');
    if (dictTab && dictTab.classList.contains('active')) {
        if (e.ctrlKey && e.code === "Space") {
            e.preventDefault();
            if (synth.speaking) {
                if (synth.paused) {
                    synth.resume();
                } else {
                    synth.pause();
                }
            } else {
                playDictationAudio(1.0);
            }
        }

        if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            const btnCheck = document.getElementById("btnCheckDict");
            if (btnCheck) btnCheck.click();
        }
    }
}
