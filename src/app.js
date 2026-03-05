// 1. NHẬP KHẨU TỪ CÁC FILE KHÁC
import { auth, db, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, collection, addDoc, getDocs, deleteDoc, doc, query, where, updateDoc, writeBatch } from './firebase-config.js';
import { speakText, downloadSample, exportJSON } from './utils.js';
// 2. IMPORT MODULE TỪ BÊN NGOÀI
import { API_BASE_URL, SRS_INTERVALS, AppState, resetAppState } from './config.js';
import { gradeAnswer, getAIHint, generateAIQuestions } from './ai-services.js';
import { fetchAllWords, addWordToBackend, deleteWordFromBackend, importCSVToBackend, updateWordSRSToBackend, deleteAllWordsFromFirebase } from './api.js';
import { updateSRSStatus, speakCurrent, resetQuiz, nextQuestion, prevQuestion, handleAnswer, forceReviewMode } from './quiz.js';
import { renderList, switchTab } from './ui.js';


// 3. LOGIC DOM & SỰ KIỆN KHỞI TẠO
document.addEventListener('DOMContentLoaded', () => {
    // Auth Event Listeners
    document.getElementById('btnLogin').addEventListener('click', () => {
        signInWithPopup(auth, new GoogleAuthProvider()).catch(err => alert("Lỗi: " + err.message));
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        signOut(auth);
    });

    // Navigation and Tabs
    const mainTabs = document.getElementById('mainTabs');
    if (mainTabs) {
        mainTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                const tabId = e.target.getAttribute('data-tab');
                switchTab(tabId);
            }
        });
    }

    // Quiz Elements
    document.getElementById('quizFilter').addEventListener('change', resetQuiz);
    document.getElementById('qWord').addEventListener('click', speakCurrent);
    document.getElementById('btnSpeak').addEventListener('click', speakCurrent);
    document.getElementById('btnHint').addEventListener('click', getAIHint);
    document.getElementById('qPhonetic').addEventListener('click', (e) => e.target.classList.add('revealed'));
    document.getElementById('btnPrev').addEventListener('click', prevQuestion);
    document.getElementById('btnNext').addEventListener('click', nextQuestion);

    document.getElementById('btnForceReview').addEventListener('click', forceReviewMode);
    // Lắng nghe sự kiện Bấm nút Chấm Bài AI
    let globalRecognition = null;
    let isRecording = false;

    // Lắng nghe sự kiện Bấm nút Chấm Bài AI và Micro
    const practicalAreaEl = document.getElementById('practicalQuestions');
    if (practicalAreaEl) {
        practicalAreaEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-grade')) {
                const container = e.target.closest('div').parentElement;
                const qText = container.querySelector('.ai-q-text').innerText;
                const aText = container.querySelector('.ai-a-text').value.trim();
                const feedbackDiv = container.querySelector('.ai-feedback');

                if (!aText) return alert("⚠️ Bách vui lòng gõ câu trả lời trước khi nhờ AI chấm nhé!");

                gradeAnswer(qText, aText, feedbackDiv, e.target);
            }

            const micBtn = e.target.closest('.btn-mic');
            if (micBtn) {
                if (isRecording && globalRecognition) {
                    globalRecognition.stop();
                    return;
                }
                const textarea = micBtn.previousElementSibling;
                const langCode = micBtn.getAttribute('data-lang');

                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    return alert("Trình duyệt của Bách chưa hỗ trợ tính năng này. Hãy thử dùng Google Chrome nhé!");
                }

                if (!globalRecognition) {
                    globalRecognition = new SpeechRecognition();
                    globalRecognition.interimResults = false;
                }
                globalRecognition.lang = langCode;

                globalRecognition.onstart = () => {
                    isRecording = true;
                    micBtn.innerText = '🔴';
                    micBtn.style.transform = 'scale(1.2)';
                    textarea.placeholder = "👂 Máy đang dỏng tai nghe Bách nói đây...";
                };

                globalRecognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    textarea.value += (textarea.value ? ' ' : '') + transcript;
                };

                globalRecognition.onerror = (event) => {
                    console.error("Lỗi Micro:", event.error);
                    if (event.error === 'not-allowed') alert("Bách chưa cấp quyền dùng Micro cho trang web rồi!");
                    isRecording = false;
                    micBtn.innerText = '🎙️';
                    micBtn.style.transform = 'scale(1)';
                    textarea.placeholder = "Gõ phím hoặc bấm micro để trả lời...";
                };

                globalRecognition.onend = () => {
                    isRecording = false;
                    micBtn.innerText = '🎙️';
                    micBtn.style.transform = 'scale(1)';
                    textarea.placeholder = "Gõ phím hoặc bấm micro để trả lời...";
                };

                globalRecognition.start();
            }
        });
    }


    document.getElementById('btnGoToData').addEventListener('click', () => switchTab('data'));

    // Data Elements
    document.getElementById('btnAddWord').addEventListener('click', addWord);
    // Ẩn/Hiện 3 ô Giải phẫu từ tùy theo ngôn ngữ (EN / CN)
    const inpLangEl = document.getElementById('inpLang');
    if (inpLangEl) {
        inpLangEl.addEventListener('change', (e) => {
            const anatomyDiv = document.getElementById('englishAnatomy');
            if (anatomyDiv) {
                // Nếu là EN thì hiện (flex), nếu là CN thì ẩn (none)
                anatomyDiv.style.display = (e.target.value === 'EN') ? 'flex' : 'none';
            }
        });
    }
    document.getElementById('btnDownloadSample').addEventListener('click', downloadSample);
    document.getElementById('btnImportCSV').addEventListener('click', importCSV);
    document.getElementById('btnExportJSON').addEventListener('click', () => exportJSON(cachedWords));
    document.getElementById('btnDeleteAll').addEventListener('click', deleteAllWords);

    // List Search Element
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', renderList);

    // Event Delegation cho Quiz Options
    document.getElementById('qOptions').addEventListener('click', (e) => {
        if (e.target.classList.contains('opt-btn') && !e.target.disabled) {
            const optId = e.target.getAttribute('data-id');
            const qData = AppState.quizHistory[AppState.historyIndex];
            const selectedOpt = qData.options.find(opt => opt.id === optId);
            if (selectedOpt) {
                handleAnswer(e.target, selectedOpt, qData.correct);
            }
        }
    });

    // Event Delegation cho List Container (Âm thanh và Xóa)
    document.getElementById('listContainer').addEventListener('click', (e) => {
        const speakBtn = e.target.closest('.btn-list-speak');
        const deleteBtn = e.target.closest('.btn-list-delete');

        if (speakBtn) {
            const w = speakBtn.getAttribute('data-w');
            const l = speakBtn.getAttribute('data-l');
            const ex = speakBtn.getAttribute('data-ex'); // Lấy câu ví dụ
            speakText(w, l, ex); // Truyền sang utils.js
        } else if (deleteBtn) {
            const id = deleteBtn.getAttribute('data-id');
            deleteWord(id);
        }
    });
});

// 4. LOGIC ĐĂNG NHẬP
onAuthStateChanged(auth, async (user) => {
    if (user) {
        AppState.currentUser = user;
        document.getElementById('userInfo').innerHTML = `Xin chào, <b>${user.displayName}</b>`;
        document.getElementById('btnLogin').style.display = 'none';
        document.getElementById('btnLogout').style.display = 'block';
        await loadDataFromCloud();
    } else {
        AppState.currentUser = null;
        AppState.cachedWords = [];
        document.getElementById('userInfo').innerHTML = `Bạn chưa đăng nhập`;
        document.getElementById('btnLogin').style.display = 'block';
        document.getElementById('btnLogout').style.display = 'none';
        document.getElementById('reviewStatus').innerHTML = "Vui lòng đăng nhập!";
        renderList();
    }
});

// 5. DATABASE SQL SERVER
async function loadDataFromCloud() {
    document.getElementById('reviewStatus').innerHTML = "⏳ Đang kết nối CSDL...";
    try {
        AppState.cachedWords = await fetchAllWords(AppState.currentUser.uid);
        updateSRSStatus();
        if (document.getElementById('list').classList.contains('active')) renderList();
        if (document.getElementById('quiz').classList.contains('active')) resetQuiz();
    } catch (error) { alert("Lỗi tải dữ liệu: " + error.message); }
}


async function addWord() {
    if (!AppState.currentUser) return alert("Đăng nhập để lưu từ!");
    const w = document.getElementById('inpWord').value.trim();
    const m = document.getElementById('inpMeaning').value.trim();
    const p = document.getElementById('inpPhonetic').value.trim();
    const l = document.getElementById('inpLang').value;

    // Lấy thêm dữ liệu giải phẫu & ví dụ (nếu người dùng có nhập)
    const prf = document.getElementById('inpPrefix')?.value.trim() || "";
    const rt = document.getElementById('inpRoot')?.value.trim() || "";
    const suf = document.getElementById('inpSuffix')?.value.trim() || "";
    const ex = document.getElementById('inpExample')?.value.trim() || "";

    // 🛑 KIỂM TRA CHẶN DẤU PHẨY (Bảo vệ dữ liệu CSV)
    if (ex.includes(',')) {
        return alert("⚠️ Lỗi: Vui lòng không dùng dấu phẩy (,) trong câu ví dụ. Thay vào đó hãy dùng dấu chấm (.) hoặc dấu chấm phẩy (;)");
    }
    if (w.includes(',') || m.includes(',')) {
        return alert("⚠️ Lỗi: Vui lòng không dùng dấu phẩy (,) trong Từ vựng và Nghĩa.");
    }

    if (!w || !m) return alert("Thiếu từ hoặc nghĩa!");

    if (AppState.cachedWords.some(item => item.w.toLowerCase() === w.toLowerCase() && item.l === l)) return alert(`Từ "${w}" đã tồn tại!`);

    const newItem = {
        w, m, l, p,
        prf, rt, suf, ex, // Đẩy các trường mới này lên Firebase
        level: 0, nextReview: 0, userId: AppState.currentUser.uid
    };

    try {
        document.getElementById('addStatus').innerText = "Đang lưu vào máy chủ...";

        const savedItem = await addWordToBackend(newItem);
        AppState.cachedWords.unshift(savedItem);

        ['inpWord', 'inpMeaning', 'inpPhonetic', 'inpPrefix', 'inpRoot', 'inpSuffix', 'inpExample'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('inpWord').focus();

        document.getElementById('addStatus').innerText = "✅ Đã lưu vào SQL!";
        setTimeout(() => document.getElementById('addStatus').innerText = "", 2000);
        updateSRSStatus();
    } catch (e) { alert("Lỗi: " + e.message); }

}

export async function deleteWord(id) {
    if (confirm("Xóa vĩnh viễn khỏi hệ thống?")) {
        try {
            await deleteWordFromBackend(id);
            AppState.cachedWords = AppState.cachedWords.filter(x => x.id !== id);
            renderList();
            updateSRSStatus();
        } catch (e) { alert("Lỗi xóa!"); }
    }
}


async function deleteAllWords() {
    if (!AppState.currentUser) return alert("Vui lòng đăng nhập!");

    // Hỏi xác nhận 2 lần để tránh bấm nhầm
    if (!confirm(`⚠️ CẢNH BÁO NGUY HIỂM:\nBạn có chắc chắn muốn XÓA VĨNH VIỄN toàn bộ ${AppState.cachedWords.length} từ vựng hiện có không? Hành động này KHÔNG THỂ HOÀN TÁC!`)) return;

    try {
        document.getElementById('reviewStatus').innerHTML = "⏳ Đang dọn dẹp mây...";

        // Quét vòng lặp và xóa từng từ trên Firebase thông qua API
        await deleteAllWordsFromFirebase(AppState.cachedWords);

        // Xóa sạch bộ nhớ RAM của app
        AppState.cachedWords = [];
        updateSRSStatus();
        if (document.getElementById('list').classList.contains('active')) renderList();

        alert("✅ Đã dọn sạch bong!");
    } catch (e) {
        alert("Lỗi khi xóa: " + e.message);
    }

}

async function importCSV() {
    if (!AppState.currentUser) return alert("Cần đăng nhập!");
    const file = document.getElementById('csvFile').files[0];
    if (!file) return alert("Chưa chọn file!");

    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result.split(/\r\n|\n/);
        const existingKeys = new Set(AppState.cachedWords.map(x => `${x.w.toLowerCase()}_${x.l}`));
        let newItems = [];

        lines.forEach(line => {
            // Tách các cột dựa vào dấu phẩy
            const parts = line.split(',');

            // Đảm bảo dòng có dữ liệu và không phải dòng tiêu đề
            if (parts.length >= 2 && !parts[0].toLowerCase().includes('tuvung')) {
                const w = parts[0]?.trim() || "";
                const m = parts[1]?.trim() || "";
                const l = parts[2]?.trim().toUpperCase() || 'EN';
                const ph = parts[3]?.trim() || "";

                // Đọc thêm 4 cột mới (Giải phẫu từ & Ví dụ)
                const prf = parts[4]?.trim() || "";
                const rt = parts[5]?.trim() || "";
                const suf = parts[6]?.trim() || "";
                const ex = parts[7]?.trim() || "";

                if (w && m) {
                    const itemKey = `${w.toLowerCase()}_${l}`;
                    if (!existingKeys.has(itemKey)) {
                        existingKeys.add(itemKey);
                        newItems.push({ w, m, l, p: ph, prf, rt, suf, ex, level: 0, nextReview: 0, userId: AppState.currentUser.uid });
                    }
                }
            }
        });


        if (newItems.length > 0) {
            document.getElementById('csvFile').value = '';
            document.getElementById('reviewStatus').innerHTML = `⏳ Đang nạp ${newItems.length} từ...`;

            try {
                await importCSVToBackend(newItems);
                alert("✅ Đã nạp thành công!");
                await loadDataFromCloud();
            } catch (error) {
                alert("Lỗi khi nạp CSV: " + error.message);
                document.getElementById('reviewStatus').innerHTML = "Lỗi nạp CSV";
            }

        } else {
            alert("Không có từ mới nào được nạp (hoặc tất cả đều bị trùng)!");
        }
    };
    reader.readAsText(file);
}
