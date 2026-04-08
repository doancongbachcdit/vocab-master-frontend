import { API_BASE_URL } from './config.js';
import { speakText } from './utils.js';

// Tính năng bôi đen từ vựng để tra từ điển nhanh
document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('dict-popup');
    if (!popup) return;

    const popupWord = document.getElementById('dict-word');
    const popupPhonetic = document.getElementById('dict-phonetic');
    const popupMeaning = document.getElementById('dict-meaning');
    const backdrop = document.getElementById('dict-backdrop');

    // UI eJoy elements
    const audioBtn = document.getElementById('dict-audio-btn');
    const saveBtn = document.getElementById('dict-save-btn');

    // Timestamp lúc popup được mở — dùng để chặn touchstart đóng popup quá sớm
    let popupOpenedAt = 0;
    const POPUP_CLOSE_COOLDOWN_MS = 800;

    // Data for saving word
    let currentWordData = { word: '', phonetic: '', meaning: '', audioUrl: '', lang: 'EN' };

    // --- eJoy UI Logic ---
    if (audioBtn) {
        audioBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent popup from closing
            const { word, audioUrl, lang } = currentWordData;

            if (audioUrl) {
                const audio = new Audio(audioUrl);
                audio.play().catch(err => {
                    console.log('Audio file error, falling back to TTS:', err);
                    speakText(word, lang);
                });
            } else if (word) {
                // Sử dụng hàm speakText tập trung để có giọng đọc chất lượng cao
                speakText(word, lang);
            }
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            const originalText = saveBtn.innerText;
            saveBtn.innerHTML = '⏳ Đang lưu...';
            saveBtn.disabled = true;

            try {
                await saveWordToDeck(currentWordData);
                saveBtn.innerHTML = 'Đã lưu ✓';
                saveBtn.style.background = 'var(--success)';
            } catch (err) {
                console.error("Lỗi lưu từ:", err);
                saveBtn.innerHTML = '❌ Lỗi';
            }

            setTimeout(() => {
                saveBtn.innerText = '+ Lưu từ này';
                saveBtn.style.background = '';
                saveBtn.disabled = false;
            }, 2000);
        });
    }

    async function saveWordToDeck(wordData) {
        // TODO: Call C# API
        console.log("-- GỌI API LƯU TỪ VỰNG --");
        console.log("Payload:", wordData);
        // Skeleton mock API delay
        return new Promise(resolve => setTimeout(resolve, 500));
    }

    function openPopup() {
        popupOpenedAt = Date.now();
        popup.classList.add('active');
        // Chỉ hiện backdrop trên mobile
        if (window.innerWidth <= 768 && backdrop) {
            backdrop.classList.add('active');
        }
    }

    function closePopup() {
        popup.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
    }

    // Tap vào backdrop để đóng bottom sheet
    if (backdrop) backdrop.addEventListener('click', closePopup);

    // ─── DESKTOP: mouseup + dblclick (giữ nguyên như cũ) ─────────────────────
    document.addEventListener('mouseup', (e) => {
        if (!isMobile()) handleSelection(e);
    });
    document.addEventListener('dblclick', (e) => {
        if (!isMobile()) handleSelection(e);
    });
    document.addEventListener('mousedown', (e) => {
        if (isMobile()) return;
        if (!popup.contains(e.target)) closePopup();
    });

    // ─── MOBILE: selectionchange ghi nhận + touchend hiển thị popup ──────────
    //
    // Tại sao không dùng selectionchange để mở popup luôn?
    // → Vì selectionchange liên tục bắn trong khi người dùng đang kéo 2 đầu
    //   handle để chọn nhiều từ. Nếu popup + backdrop mở ra lúc này sẽ
    //   che màn hình, chặn thao tác kéo → người dùng chỉ chọn được 1 từ.
    //
    // Giải pháp: selectionchange CHỈ ghi nhận text, touchend mới mở popup
    // (lúc người dùng nhấc tay lên = đã hoàn tất chọn).

    let pendingSelectedText = '';

    document.addEventListener('selectionchange', () => {
        if (!isMobile()) return;
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : '';
        // Chỉ cập nhật pending, CHƯA mở popup
        pendingSelectedText = (text.length > 0 && text.length <= 300) ? text : '';
    });

    document.addEventListener('touchend', () => {
        if (!isMobile()) return;
        // Đợi 120ms để getSelection() trả về text cuối cùng sau khi nhấc tay
        setTimeout(() => {
            // Ưu tiên lấy lại trực tiếp từ getSelection (mới nhất sau khi nhấc tay)
            const sel = window.getSelection();
            const finalText = (sel ? sel.toString().trim() : '') || pendingSelectedText;
            if (finalText.length > 0 && finalText.length <= 300) {
                showMobilePopup(finalText);
            }
            pendingSelectedText = '';
        }, 120);
    });

    // touchstart: chỉ đóng popup nếu đã qua cooldown (tránh đóng ngay sau khi vừa mở)
    document.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        const elapsed = Date.now() - popupOpenedAt;
        if (elapsed < POPUP_CLOSE_COOLDOWN_MS) return; // Còn trong cooldown → bỏ qua
        if (!popup.contains(e.target) && e.target !== backdrop) {
            closePopup();
        }
    }, { passive: true });

    // ─── Helper ──────────────────────────────────────────────────────────────
    function isMobile() {
        return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    }

    async function showMobilePopup(selectedText) {
        // Xóa top/left cũ để CSS bottom-sheet hoạt động đúng
        popup.style.top = '';
        popup.style.left = '';

        popupWord.innerText = selectedText;
        popupPhonetic.innerText = '';
        popupMeaning.innerHTML = `<span class="loader">⏳ Đang tìm nghĩa...</span>`;
        if (audioBtn) audioBtn.style.display = 'none';

        currentWordData = { word: selectedText, phonetic: '', meaning: '', audioUrl: '' };

        openPopup();
        await fetchDefinition(selectedText);
    }

    async function handleSelection(event) {
        if (popup.contains(event.target)) return;

        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText.length > 0 && selectedText.length <= 300) {
            // Lấy vị trí của đoạn text được bôi đen (Desktop)
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            const top = rect.bottom + window.scrollY + 10;
            let left = rect.left + window.scrollX;

            // Đảm bảo không tràn ra ngoài màn hình Desktop
            const popupWidth = 280;
            const viewportWidth = window.innerWidth;
            if (left + popupWidth > viewportWidth - 10) {
                left = viewportWidth - popupWidth - 10;
            }
            if (left < 10) left = 10;

            popup.style.top = `${top}px`;
            popup.style.left = `${left}px`;

            popupWord.innerText = selectedText;
            popupPhonetic.innerText = '';
            popupMeaning.innerHTML = `<span class="loader">⏳ Đang tìm nghĩa...</span>`;
            if (audioBtn) audioBtn.style.display = 'none';

            currentWordData = { word: selectedText, phonetic: '', meaning: '', audioUrl: '' };

            openPopup();
            await fetchDefinition(selectedText);
        } else {
            closePopup();
        }
    }

    async function fetchDefinition(word) {
        // Chỉ gọi API Từ điển tiếng Anh nếu đó là MỘT TỪ ĐƠN thuần tiếng Anh (không chứa khoảng trắng, số...)
        // Nâng cấp: Cho phép cụm từ tối đa 3 từ
        const wordCount = word.trim().split(/\s+/).length;
        const isEnglishWord = wordCount <= 3 && /^[a-zA-Z\- '\.]+$/.test(word);
        currentWordData.lang = isEnglishWord ? 'EN' : 'CN';

        if (!isEnglishWord) {
            // Trường hợp Câu/Đoạn văn hoặc không phải tiếng Anh
            popupWord.innerText = word;
            popupPhonetic.style.display = 'none'; // Ẩn phiên âm

            // Vẫn cho phép đọc bằng TTS Audio Web API
            currentWordData.audioUrl = ''; // Fallback TTS
            if (audioBtn) audioBtn.style.display = 'flex';

            popupMeaning.innerHTML = `
                <div id="dict-vn-meaning" style="color: #334155; font-size: 15px; margin-bottom: 15px;"><span class="loader">⏳ Đang dịch...</span></div>
                <button id="btn-deep-ai" class="btn btn-outline" style="font-size:13px; padding: 8px;">🤖 Dịch sâu bằng AI</button>
            `;

            setTimeout(() => {
                const aiBtn = document.getElementById('btn-deep-ai');
                if (aiBtn) aiBtn.addEventListener('click', () => alert('Tính năng gọi API AI Backend C# sắp ra mắt!'));
            }, 50);

            fetchVietnameseMeaning(word);
            return;
        }

        popupPhonetic.style.display = 'block'; // Hiện lại phiên âm

        try {
            // 1. Gọi API miễn phí lấy tiếng Anh (Rất nhanh)
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

            if (!response.ok) {
                throw new Error("Không tìm thấy từ");
            }

            const data = await response.json();

            const entry = data[0];
            const phonetic = entry.phonetic || (entry.phonetics.find(p => p.text) || {}).text || '';

            // Lấy URL âm thanh (eJoy feature)
            const phoneticWithAudio = entry.phonetics.find(p => p.audio && p.audio.length > 0);
            const audioUrl = phoneticWithAudio ? phoneticWithAudio.audio : '';
            if (audioUrl || word) {
                if (audioBtn) audioBtn.style.display = 'flex';
                currentWordData.audioUrl = audioUrl;
            }

            const firstMeaning = entry.meanings[0];
            const partOfSpeech = firstMeaning.partOfSpeech;
            const definition = firstMeaning.definitions[0].definition;

            currentWordData.phonetic = phonetic;
            currentWordData.meaning = `(${partOfSpeech}) ${definition}`;

            // Hiển thị tiếng Anh trước
            popupWord.innerText = entry.word;
            popupPhonetic.innerText = phonetic ? phonetic : '';
            popupMeaning.innerHTML = `
                <div style="margin-bottom: 8px; color: #334155;"><b>(EN)</b> <i>${partOfSpeech}</i>: ${definition}</div>
                <div class="dict-divider"></div>
                <div id="dict-vn-meaning" style="color: #2563eb; font-weight: 500;"><span class="loader">⏳ Đang dò nghĩa Tiếng Việt...</span></div>
            `;

            // 2. Gọi API lấy tiếng Việt
            fetchVietnameseMeaning(word);

        } catch (error) {
            // Nếu từ điển Anh-Anh không tìm thấy (ví dụ: tiếng Trung, tiếng Nhật, tên riêng...)
            popupWord.innerText = word;
            popupPhonetic.style.display = 'none';
            if (audioBtn) audioBtn.style.display = 'flex'; // fallback TTS
            popupMeaning.innerHTML = `<div id="dict-vn-meaning" style="color: #2563eb; font-weight: 500; font-size: 15px;"><span class="loader">⏳ Đang dịch...</span></div>`;
            fetchVietnameseMeaning(word);
        }
    }

    async function fetchVietnameseMeaning(word) {
        const vnDiv = document.getElementById('dict-vn-meaning');
        if (!vnDiv) return;

        try {
            // Sử dụng sl=auto để Google nhận diện Anh/Trung, thêm dt=rm để lấy phiên âm (Pinyin)
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&dt=rm&q=${encodeURIComponent(word)}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();

                let tvMeaning = "";
                let pinyin = "";

                if (data[0] && Array.isArray(data[0])) {
                    data[0].forEach(item => {
                        if (item) {
                            // Nếu item[0] là string -> Đây là chuỗi dịch [ "mối quan hệ", "关系" ]
                            if (typeof item[0] === 'string') {
                                tvMeaning += item[0];
                            }
                            // Nếu item[0] là null -> Đây là mảng chứa Romanization/Pinyin (vd: [null, null, "Guānxì", ""])
                            else if (item[0] === null && item[1] === null) {
                                // Pinyin có thể nằm ở index 2 hoặc 3 tùy từ
                                pinyin = item[3] || item[2] || "";
                            }
                        }
                    });
                }

                // Trình bày kết quả dịch gọn gàng
                if (pinyin && pinyin.toLowerCase() !== word.toLowerCase()) {
                    vnDiv.innerHTML = `<b>(VI)</b> [${pinyin}] ${tvMeaning.trim()}`;
                } else {
                    vnDiv.innerHTML = `<b>(VI)</b> ${tvMeaning.trim()}`;
                }

                // Cập nhật nghĩa tiếng Việt vào currentWordData
                if (!currentWordData.meaning) {
                    currentWordData.meaning = tvMeaning.trim();
                } else {
                    currentWordData.meaning += ` | (VI) ${tvMeaning.trim()}`;
                }
            } else {
                vnDiv.innerHTML = `<b>(Lỗi)</b> ❌ Không thể dịch (Mã: ${response.status})`;
            }
        } catch (e) {
            vnDiv.innerHTML = `<b>(Lỗi)</b> ❌ Lỗi kết nối mạng`;
        }
    }
});
