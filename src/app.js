// 1. NHẬP KHẨU TỪ CÁC FILE KHÁC
import { auth, db, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, collection, addDoc, getDocs, deleteDoc, doc, query, where, updateDoc, writeBatch } from './firebase-config.js';
import { speakText, downloadSample, exportJSON } from './utils.js';
// 2. IMPORT MODULE TỪ BÊN NGOÀI
import { API_BASE_URL, AppState, resetAppState } from './config.js';
import { gradeAnswer, getAIHint, generateAIQuestions } from './ai-services.js';
import { fetchAllWords, addWordToBackend, deleteWordFromBackend, importCSVToBackend, updateWordSRSToBackend, deleteAllWordsFromFirebase } from './api.js';
import { updateSRSStatus, speakCurrent, resetQuiz, nextQuestion, prevQuestion, handleAnswer, forceReviewMode, handleSM2Rating, handleMatchClick, handleFillBlankOptionClick } from './quiz.js';
import { renderList, switchTab, showLoader, hideLoader } from './ui.js';
import { loadRandomDictation, handleDictationKeydown } from './dictation.js';
import './dictation.js'; // Kích hoạt chức năng Dictation ngay khi app load
import './dictionaryPopup.js'; // Kích hoạt chức năng tra từ ngay khi app load
import AIChatbox from './aiChatbox.js';

// Khởi tạo Chatbox AI
document.addEventListener('DOMContentLoaded', () => {
    new AIChatbox();
});


// 3. LOGIC DOM & SỰ KIỆN KHỞI TẠO
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', handleDictationKeydown);
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
                window.switchTab(tabId);
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


    document.getElementById('btnGoToData').addEventListener('click', () => window.switchTab('data'));

    // Data Elements
    document.getElementById('btnAddWord').addEventListener('click', addWord);
    document.getElementById('btnAutoFill').addEventListener('click', autoFillWord);
    document.getElementById('btnRefreshFeed').addEventListener('click', () => fetchDevToArticles(true));
    document.getElementById('btnRefreshYoutube').addEventListener('click', () => fetchYouTubeVideos(true));
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
    document.getElementById('btnExportJSON').addEventListener('click', () => exportJSON(AppState.cachedWords));
    document.getElementById('btnImportJSON').addEventListener('click', () => document.getElementById('jsonFile').click());
    document.getElementById('jsonFile').addEventListener('change', importJSON);
    document.getElementById('btnDeleteAll').addEventListener('click', deleteAllWords);

    // List Search Element
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', renderList);

    // Event Delegation cho Quiz Options (Trắc nghiệm)
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

    // Event Delegation cho Match Grid (Nối từ)
    document.getElementById('matchGrid').addEventListener('click', (e) => {
        const card = e.target.closest('.match-card');
        if (card && !card.classList.contains('matched')) {
            const id = card.getAttribute('data-id');
            const type = card.getAttribute('data-type');
            const index = card.getAttribute('data-index');
            handleMatchClick(card, id, type, index);
        }
    });

    // Event Delegation cho Fill Blank Options (Điền từ)
    document.getElementById('fbOptions').addEventListener('click', (e) => {
        if (e.target.classList.contains('fb-pill') && !e.target.disabled) {
            handleFillBlankOptionClick(e.target.innerText);
        }
    });

    // Lắng nghe sự kiện click Đánh giá SM-2
    document.getElementById('sm2Actions').addEventListener('click', (e) => {
        if (e.target.classList.contains('sm2-btn')) {
            const quality = parseInt(e.target.getAttribute('data-q'), 10);
            handleSM2Rating(quality);
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

// Hàm chuyển tab
window.switchTab = function (tabId) {
    document.querySelectorAll('.content').forEach(tab => {
        if (tab.id === tabId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    if (tabId === 'list') renderList();
    if (tabId === 'quiz') resetQuiz();
    if (tabId === 'dictation') loadRandomDictation();
    if (tabId === 'reading') {
        const feedDiv = document.getElementById('devtoFeed');
        if (feedDiv && feedDiv.innerHTML.trim() === '') {
            fetchDevToArticles(false);
        }
    }
    if (tabId === 'listening') {
        const ytDiv = document.getElementById('youtubeFeed');
        if (ytDiv && ytDiv.innerHTML.trim() === '') {
            fetchYouTubeVideos(false);
        }
    }
}

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
    if (AppState.isLoading) return; // Chặn nếu đang tải để tránh nhân đôi dữ liệu
    AppState.isLoading = true;

    showLoader("⏳ Đang tải dữ liệu từ máy chủ...");
    document.getElementById('reviewStatus').innerHTML = "⏳ Đang kết nối CSDL...";
    try {
        AppState.cachedWords = []; // Reset kho từ cục bộ
        const limit = 50; 

        document.getElementById('reviewStatus').innerHTML = `⏳ Đang tải ${limit} từ đầu tiên...`;
        const firstPageData = await fetchAllWords(AppState.currentUser.uid, 1, limit);
        
        // Gộp dữ liệu đảm bảo không trùng IDs
        mergeWords(firstPageData);
        
        updateSRSStatus();
        if (document.getElementById('list').classList.contains('active')) renderList();
        if (document.getElementById('quiz').classList.contains('active')) resetQuiz();
        hideLoader(); 
        
        if (firstPageData.length === limit) {
             loadRemainingDataInBackground(2, limit);
        } else {
             document.getElementById('reviewStatus').innerHTML = `✅ Đã tải xong dữ liệu!`;
             AppState.isLoading = false; // Kết thúc tải
        }
    } catch (error) {
        console.error("Lỗi loadDataFromCloud:", error);
        document.getElementById('reviewStatus').innerHTML = "⚠️ Lỗi tải dữ liệu (kiểm tra CORS backend)!";
        AppState.isLoading = false;
        hideLoader();
    }
}

// Hàm phụ tải ngầm để trang web không bị treo (Background Fetching)
async function loadRemainingDataInBackground(startPage, limit) {
    let currPage = startPage;
    let keepFetching = true;
    try {
        while (keepFetching) {
            document.getElementById('reviewStatus').innerHTML = `🔄 Đang tải ngầm trang ${currPage}...`;
            const pageData = await fetchAllWords(AppState.currentUser.uid, currPage, limit);
            
            mergeWords(pageData);
            
            if (pageData.length < limit) {
                keepFetching = false;
                document.getElementById('reviewStatus').innerHTML = `✅ Đã đồng bộ toàn bộ từ vựng!`;
            } else {
                currPage++;
            }
        }
        updateSRSStatus();
        if (document.getElementById('list').classList.contains('active')) renderList();
    } catch(err) {
        console.error("Lỗi tải ngầm dữ liệu:", err);
        document.getElementById('reviewStatus').innerHTML = "⚠️ Lỗi tải ngầm một số từ!";
    } finally {
        AppState.isLoading = false;
    }
}

// Hàm helper gộp từ vựng không trùng lặp ID (Smart UPSERT)
function mergeWords(newWords) {
    if (!Array.isArray(newWords)) return;
    
    // Sử dụng Map để vừa lọc trùng vừa cập nhật dữ liệu mới nhất
    const map = new Map();
    // Đưa các từ hiện tại vào map
    AppState.cachedWords.forEach(w => map.set(w.id, w));
    
    // Gộp từ mới vào (nếu trùng ID sẽ ghi đè bản mới nhất)
    newWords.forEach(nw => {
        if (nw && nw.id) map.set(nw.id, nw);
    });
    
    // Cập nhật lại AppState.cachedWords
    AppState.cachedWords = Array.from(map.values());
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


    if (!w || !m) return alert("Thiếu từ hoặc nghĩa!");

    if (AppState.cachedWords.some(item => item.w.toLowerCase() === w.toLowerCase() && item.l === l)) return alert(`Từ "${w}" đã tồn tại!`);

    const newItem = {
        w, m, l, p,
        prf, rt, suf, ex, // Đẩy các trường mới này lên Firebase
        level: 0, nextReview: 0, userId: AppState.currentUser.uid
    };

    const btnAddWord = document.getElementById('btnAddWord');
    if (btnAddWord) {
        btnAddWord.disabled = true;
        btnAddWord.innerText = "⏳ Đang lưu...";
    }

    try {
        document.getElementById('addStatus').innerText = "Đang lưu vào máy chủ...";

        const savedItem = await addWordToBackend(newItem);
        mergeWords([savedItem]);

        ['inpWord', 'inpMeaning', 'inpPhonetic', 'inpPrefix', 'inpRoot', 'inpSuffix', 'inpExample'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('inpWord').focus();

        document.getElementById('addStatus').innerText = "✅ Đã lưu vào SQL!";
        setTimeout(() => document.getElementById('addStatus').innerText = "", 2000);
        updateSRSStatus();
    } catch (e) {
        alert("Lỗi: " + e.message);
    } finally {
        if (btnAddWord) {
            btnAddWord.disabled = false;
            btnAddWord.innerText = "Lưu Lên Mây";
        }
    }

}



async function autoFillWord() {
    const inpWord = document.getElementById('inpWord');
    const inpLang = document.getElementById('inpLang');
    const btnAutoFill = document.getElementById('btnAutoFill');

    const word = inpWord.value.trim();
    const lang = inpLang.value; // 'EN' hoặc 'CN'

    if (!word) {
        alert("Vui lòng nhập từ vựng trước khi nhấn Auto Fill!");
        return;
    }

    // Đổi trạng thái nút để báo hiệu đang tải
    const originalBtnText = btnAutoFill.innerHTML;
    btnAutoFill.disabled = true;
    btnAutoFill.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Đang tìm...`;

    try {
        let systemPrompt = "";

        if (lang === 'EN') {
            // TIẾNG ANH: Yêu cầu AI trả nghĩa tiếng Việt và ví dụ tiếng Anh
            systemPrompt = `Bạn là từ điển Anh-Việt. Tra từ: "${word}". 
            Trả về duy nhất 1 chuỗi JSON (không markdown, không giải thích):
            {
                "pronunciation": "phiên âm IPA của từ",
                "meaning": "nghĩa ngắn gọn bằng tiếng Việt",
                "example": "1 câu ví dụ tiếng Anh trình độ B1, có ít nhất 1 mệnh đề hoặc cụm từ mở rộng, dài 8-15 từ, không dùng câu quá đơn giản"
            }`;
        } else if (lang === 'CN') {
            // TIẾNG TRUNG: Yêu cầu AI trả ví dụ bằng chữ Hán
            // Ghi chú: Nếu bạn muốn inpExample CHỈ CHỨA chữ Hán của từ đó, hãy đổi câu lệnh prompt ở phần 'example'
            systemPrompt = `Bạn là từ điển Trung-Việt. Tra từ: "${word}". 
            Trả về duy nhất 1 chuỗi JSON (không markdown, không giải thích):
            {
                "pronunciation": "phiên âm Pinyin của từ",
                "meaning": "nghĩa ngắn gọn bằng tiếng Việt",
                "example": "1 câu ví dụ thuần Chữ Hán (không kèm pinyin) chứa từ đó" 
            }`;
        }

        // Gọi chung 1 API Backend C# cho cả 2 ngôn ngữ
        const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: systemPrompt })
        });

        if (response.ok) {
            const aiResult = await response.json();

            // Xử lý dữ liệu trả về (tùy thuộc vào C# trả về trường result hay answer)
            let rawText = aiResult.answer || aiResult.result || aiResult.message || aiResult;
            if (typeof rawText !== 'string') rawText = JSON.stringify(rawText);

            // Dọn dẹp markdown
            let cleanJsonStr = (aiResult.result ?? '').replace(/```json/g, '').replace(/```/g, '').trim();
            const wordData = JSON.parse(cleanJsonStr);

            // Điền dữ liệu vào form
            document.getElementById('inpPhonetic').value = wordData.pronunciation || "";
            document.getElementById('inpMeaning').value = wordData.meaning || "";
            document.getElementById('inpExample').value = wordData.example || "";

        } else {
            alert("AI Backend phản hồi lỗi hoặc đang quá tải!");
        }
    } catch (error) {
        console.error("Lỗi Auto Fill:", error);
        alert("Đã xảy ra lỗi kết nối khi lấy dữ liệu từ AI!");
    } finally {
        // Trả lại trạng thái ban đầu cho nút
        btnAutoFill.disabled = false;
        btnAutoFill.innerHTML = originalBtnText;
    }
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
        showLoader("⏳ Đang dọn dẹp dữ liệu máy chủ...");
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
    } finally {
        hideLoader();
    }

}

async function fetchYouTubeVideos(forceRefresh = true) {
    const feedDiv = document.getElementById('youtubeFeed');
    const channelId = document.getElementById('ytChannelSelect').value;

    // Xóa nội dung cũ khi ép tải lại
    if (forceRefresh) feedDiv.innerHTML = '';
    else if (feedDiv.innerHTML.trim() !== '') return;

    showLoader("⏳ Đang kéo video từ YouTube...");
    try {
        // Dùng trick đọc RSS của Youtube thông qua con trung gian rss2json để không tốn API Key
        const rssUrl = encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`);
        if (!response.ok) throw new Error("Mạng lỗi khi tải video.");
        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            feedDiv.innerHTML = '<p style="text-align:center;">Không có video nào để hiển thị.</p>';
            return;
        }

        // Chỉ lôi 5 video mới nhất ra cho đỡ giật
        const latestVideos = data.items.slice(0, 5);

        latestVideos.forEach(item => {
            // Cấu trúc link item.link là https://www.youtube.com/watch?v=XXXXXXX
            const videoIdMatch = item.link.match(/v=([^&]+)/);
            const videoId = videoIdMatch ? videoIdMatch[1] : '';

            if (videoId) {
                const articleCard = document.createElement('div');
                articleCard.className = 'card';
                articleCard.style.padding = '0';
                articleCard.style.overflow = 'hidden';
                articleCard.style.marginBottom = '0';

                articleCard.innerHTML = `
                    <div style="padding: 15px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
                        <h4 style="margin: 0; color: var(--text-color); font-size: 1.1em;">
                            <a href="${item.link}" target="_blank" style="text-decoration: none; color: inherit;">${item.title}</a>
                        </h4>
                        <div style="font-size: 0.85em; color: #64748b; margin-top: 5px;">📅 Xuất bản: ${new Date(item.pubDate).toLocaleDateString()}</div>
                    </div>
                    <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
                        <iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" 
                                src="https://www.youtube.com/embed/${videoId}?rel=0" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowfullscreen>
                        </iframe>
                    </div>
                `;
                feedDiv.appendChild(articleCard);
            }
        });
    } catch (e) {
        feedDiv.innerHTML = `<p style="text-align:center; color:red;">Lỗi tải video: ${e.message}</p>`;
    } finally {
        hideLoader();
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

            const btnImportCSV = document.getElementById('btnImportCSV');
            if (btnImportCSV) {
                btnImportCSV.disabled = true;
                btnImportCSV.innerText = "⏳ Đang nạp...";
            }

            try {
                showLoader(`⏳ Đang nạp ${newItems.length} từ...`);
                await importCSVToBackend(newItems);
                alert("✅ Đã nạp thành công!");
                await loadDataFromCloud();
            } catch (error) {
                alert("Lỗi khi nạp CSV: " + error.message);
                document.getElementById('reviewStatus').innerHTML = "Lỗi nạp CSV";
            } finally {
                hideLoader();
                if (btnImportCSV) {
                    btnImportCSV.disabled = false;
                    btnImportCSV.innerText = "Nạp CSV";
                }
            }

        } else {
            alert("Không có từ mới nào được nạp (hoặc tất cả đều bị trùng)!");
        }
    };
    reader.readAsText(file);
}

async function importJSON(event) {
    if (!AppState.currentUser) return alert("Cần đăng nhập!");
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error("File JSON không hợp lệ. Hãy đảm bảo đó là file Backup gốc.");

            const existingKeys = new Set(AppState.cachedWords.map(x => `${x.w.toLowerCase()}_${x.l}`));
            let newItems = [];

            data.forEach(item => {
                const w = item.w?.trim() || "";
                const m = item.m?.trim() || "";
                const l = item.l?.trim().toUpperCase() || 'EN';
                const p = item.p?.trim() || "";
                const prf = item.prf?.trim() || "";
                const rt = item.rt?.trim() || "";
                const suf = item.suf?.trim() || "";
                const ex = item.ex?.trim() || "";

                if (w && m) {
                    const itemKey = `${w.toLowerCase()}_${l}`;
                    if (!existingKeys.has(itemKey)) {
                        existingKeys.add(itemKey);
                        newItems.push({ 
                            w, m, l, p, prf, rt, suf, ex, 
                            level: item.level || 0, 
                            nextReview: item.nextReview || 0,
                            easeFactor: item.easeFactor || 2.5,
                            interval: item.interval || 0,
                            userId: AppState.currentUser.uid 
                        });
                    }
                }
            });

            if (newItems.length > 0) {
                document.getElementById('reviewStatus').innerHTML = `⏳ Đang phục hồi ${newItems.length} từ...`;
                
                const btnImportJSON = document.getElementById('btnImportJSON');
                if (btnImportJSON) {
                    btnImportJSON.disabled = true;
                    btnImportJSON.innerText = "⏳ Đang phục hồi...";
                }

                showLoader(`⏳ Đang phục hồi ${newItems.length} từ...`);
                // Sử dụng tái sử dụng API import của CSV (nhận mảng Object)
                await importCSVToBackend(newItems);
                alert("✅ Đã phục hồi backup thành công!");
                
                if (btnImportJSON) {
                    btnImportJSON.disabled = false;
                    btnImportJSON.innerText = "⬆️ Phục hồi Backup (JSON)";
                }

                await loadDataFromCloud();
            } else {
                alert("Dữ liệu trong Backup đã có sẵn trên hệ thống (hoặc không có từ mới)!");
            }
        } catch (error) {
            alert("Lỗi khi đọc file JSON: " + error.message);
        } finally {
            event.target.value = ''; // Reset input
            hideLoader();
        }
    };
    reader.readAsText(file);
}

async function fetchDevToArticles(forceRefresh = true) {
    const feedDiv = document.getElementById('devtoFeed');

    // Xóa nội dung cũ khi ép tải lại
    if (forceRefresh) feedDiv.innerHTML = '';
    else if (feedDiv.innerHTML.trim() !== '') return;

    showLoader("⏳ Đang kéo bài viết từ Dev.to...");
    try {
        const response = await fetch('https://dev.to/api/articles?tag=programming&top=7');
        if (!response.ok) throw new Error("Mạng lỗi khi tải bài viết.");
        const data = await response.json();

        if (!data || data.length === 0) {
            feedDiv.innerHTML = '<p style="text-align:center;">Không có bài viết nào để hiển thị.</p>';
            return;
        }

        const latestArticles = data.slice(0, 5);

        latestArticles.forEach(item => {
            const articleCard = document.createElement('div');
            articleCard.className = 'card';
            articleCard.style.padding = '15px';
            articleCard.style.marginBottom = '15px';
            articleCard.style.borderLeft = '4px solid #3b82f6';

            // Generate Tags UI
            let tagsHtml = '';
            if (item.tag_list && item.tag_list.length > 0) {
                tagsHtml = item.tag_list.slice(0, 3).map(tag => `<span style="background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:4px; font-size:0.75em; margin-right:5px;">#${tag}</span>`).join('');
            }

            articleCard.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 8px 0; color: var(--text-color); font-size: 1.1em;">
                            <a href="${item.url}" target="_blank" style="text-decoration: none; color: #1d4ed8;">${item.title}</a>
                        </h4>
                        <div style="font-size: 0.85em; color: #64748b; margin-bottom: 8px;">
                            ✍️ Bởi: <b>${item.user.name}</b> | 📅 Xuất bản: ${new Date(item.published_at).toLocaleDateString()}
                        </div>
                        <div style="margin-bottom: 8px;">${tagsHtml}</div>
                        <p style="font-size: 0.9em; color: #475569; margin: 0; line-height: 1.4;">
                            ${item.description || 'Không có tóm tắt...'}
                        </p>
                    </div>
                </div>
            `;
            feedDiv.appendChild(articleCard);
        });
    } catch (e) {
        feedDiv.innerHTML = `<p style="text-align:center; color:red;">Lỗi tải bài viết: ${e.message}</p>`;
    } finally {
        hideLoader();
    }
}

// Mở khóa hàm để index.html có thể gọi được
window.loadRandomDictation = loadRandomDictation;