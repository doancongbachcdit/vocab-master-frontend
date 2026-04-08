// Cache để lưu giọng đọc đã chọn, tránh tìm kiếm lặp lại gây delay
const voiceCache = {
    'EN': null,
    'CN': null
};

// Hàm đọc âm thanh
export function speakText(word, lang, example = "", rate = 1.0) {
    if (!('speechSynthesis' in window)) return;
    
    // Cancel ngay lập tức âm thanh cũ để phản hồi nhanh nhất
    window.speechSynthesis.cancel();

    // Nếu không có nội dung, thoát sớm (dùng để stop audio)
    if (!word && !example) return;

    const voices = window.speechSynthesis.getVoices();
    
    const getPreferredVoice = (language) => {
        if (voiceCache[language]) return voiceCache[language];
        
        let selectedVoice = null;
        if (language === 'CN') {
            selectedVoice = voices.find(v => v.lang === 'zh-CN' && (v.name.includes("Google") || v.name.includes("Microsoft")));
        } else {
            // Ưu tiên các giọng Anh-Anh (UK) chất lượng cao
            const preferredNames = [
                "Microsoft Libby Online",  // Giọng nữ UK rất hay của Edge
                "Google UK English Female", // Giọng nữ UK chuẩn của Chrome
                "Microsoft Sonia Online",  // Giọng nữ UK khác của Edge
                "Google UK English Male",   // Giọng nam UK của Chrome
                "English (United Kingdom)"
            ];
            for (const name of preferredNames) {
                selectedVoice = voices.find(v => v.name.includes(name));
                if (selectedVoice) break;
            }
            if (!selectedVoice) selectedVoice = voices.find(v => v.lang.includes("en-GB") || v.lang.includes("en_GB"));
        }
        
        if (selectedVoice) voiceCache[language] = selectedVoice;
        return selectedVoice;
    };

    const createUtterance = (text, customRate) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
        const voice = getPreferredVoice(lang === 'CN' ? 'CN' : 'EN');
        if (voice) utterance.voice = voice;
        utterance.rate = customRate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        return utterance;
    };

    if (example) {
        // ... (logic cũ cho câu ví dụ vẫn giữ nguyên vì cần delay giữa từ và câu)
        const wordUtterance = createUtterance(word, 0.8);
        const exUtterance = createUtterance(example, rate);
        window.speechSynthesis.speak(wordUtterance);
        wordUtterance.onend = () => {
            setTimeout(() => {
                window.speechSynthesis.speak(exUtterance);
            }, 400);
        };
    } else {
        // Đọc từ đơn: PHÁT NGAY LẬP TỨC
        const wordOnlyUtterance = createUtterance(word, rate);
        window.speechSynthesis.speak(wordOnlyUtterance);
    }
}

// Lắng nghe sự kiện voice changed để cập nhật cache khi browser load xong voices
if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        voiceCache.EN = null;
        voiceCache.CN = null;
    };
}


// Hàm tải file mẫu Excel
export function downloadSample() {
    const c = "\uFEFFTuVung,Nghia,NgonNgu(EN/CN),PhienAm,TienTo,GocTu,HauTo,CauViDu\nUnbelievable,Không thể tin được,EN,/ˌʌnbɪˈliːvəbl/,un,believe,able,It is an unbelievable story.\n你好,Xin chào,CN,nǐ hǎo,,,,";
    const b = new Blob([c], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = "Mau_Moi_Pro.csv"; a.click();
}

// Hàm tải file Backup
export function exportJSON(cachedWords) {
    const b = new Blob([JSON.stringify(cachedWords)], { type: "application/json" });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `Backup_Cloud_${Date.now()}.json`; a.click();
}