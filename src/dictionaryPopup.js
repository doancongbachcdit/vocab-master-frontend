import { API_BASE_URL } from './config.js';

// Tính năng bôi đen từ vựng để tra từ điển nhanh
document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('dict-popup');
    if (!popup) return;

    const popupWord = document.getElementById('dict-word');
    const popupPhonetic = document.getElementById('dict-phonetic');
    const popupMeaning = document.getElementById('dict-meaning');

    // Lắng nghe sự kiện bôi đen xong (nhả chuột) hoặc click đúp
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('dblclick', handleSelection);

    // Ẩn pop-up nếu click ra ngoài hoặc vùng không có text
    document.addEventListener('mousedown', (e) => {
        if (!popup.contains(e.target)) {
            popup.classList.remove('active');
        }
    });

    async function handleSelection(event) {
        // Đảm bảo không xử lý nếu người dùng đang click vào chính phần pop-up
        if (popup.contains(event.target)) return;

        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        // Kiểm tra xem có text được bôi đen không và nó có phải là 1 từ duy nhất không
        if (selectedText.length > 0 && selectedText.indexOf(' ') === -1) {

            // Lấy vị trí của đoạn text được bôi đen
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Xác định tọa độ hiển thị pop-up
            const top = rect.bottom + window.scrollY + 10;
            const left = rect.left + window.scrollX;

            popup.style.top = `${top}px`;
            popup.style.left = `${left}px`;

            // Cài đặt trạng thái đang tải
            popupWord.innerText = selectedText;
            popupPhonetic.innerText = '';
            popupMeaning.innerHTML = `<span class="loader">⏳ Đang tìm nghĩa...</span>`;

            // Hiện pop-up lên trước
            popup.classList.add('active');

            // Gọi API tra từ
            await fetchDefinition(selectedText);
        } else {
            popup.classList.remove('active');
        }
    }

    async function fetchDefinition(word) {
        // Kiểm tra xem từ có phải là ký tự tiếng Anh không (chỉ chứa chữ cái a-z, khoảng trắng, gạch nối, nháy đơn)
        const isEnglishWord = /^[a-zA-Z\s\-']+$/.test(word);

        if (!isEnglishWord) {
            // Đây không phải là tiếng Anh (ví dụ tiếng Trung, số...), bỏ qua API Anh-Anh luôn để tránh bị web báo lỗi Đỏ (404)
            popupWord.innerText = word;
            popupPhonetic.innerText = '';
            popupMeaning.innerHTML = `<div id="dict-vn-meaning" style="color: #2563eb; font-weight: 500; font-size: 15px;"><span class="loader">⏳ Đang dịch...</span></div>`;
            fetchVietnameseMeaning(word);
            return;
        }

        try {
            // 1. Gọi API miễn phí lấy tiếng Anh (Rất nhanh)
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

            if (!response.ok) {
                throw new Error("Không tìm thấy từ");
            }

            const data = await response.json();

            const entry = data[0];
            const phonetic = entry.phonetic || (entry.phonetics.find(p => p.text) || {}).text || '';
            const firstMeaning = entry.meanings[0];
            const partOfSpeech = firstMeaning.partOfSpeech;
            const definition = firstMeaning.definitions[0].definition;

            // Hiển thị tiếng Anh trước
            popupWord.innerText = entry.word;
            popupPhonetic.innerText = phonetic ? phonetic : '';
            popupMeaning.innerHTML = `
                <div style="margin-bottom: 8px; color: #334155;"><b>(EN)</b> <i>${partOfSpeech}</i>: ${definition}</div>
                <div id="dict-vn-meaning" style="color: #2563eb; font-weight: 500; border-top: 1px dashed #cbd5e1; padding-top: 8px;"><span class="loader">⏳ Đang dò nghĩa Tiếng Việt...</span></div>
            `;

            // 2. Gọi API lấy tiếng Việt
            fetchVietnameseMeaning(word);

        } catch (error) {
            // Nếu từ điển Anh-Anh không tìm thấy (ví dụ: tiếng Trung, tiếng Nhật, tên riêng...)
            popupWord.innerText = word;
            popupPhonetic.innerText = '';
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
                    vnDiv.innerHTML = `<b>(Dịch)</b> [${pinyin}] ${tvMeaning.trim()}`;
                } else {
                    vnDiv.innerHTML = `<b>(Dịch)</b> ${tvMeaning.trim()}`;
                }
            } else {
                vnDiv.innerHTML = `<b>(Lỗi)</b> ❌ Không thể dịch (Mã: ${response.status})`;
            }
        } catch (e) {
            vnDiv.innerHTML = `<b>(Lỗi)</b> ❌ Lỗi kết nối mạng`;
        }
    }
});
