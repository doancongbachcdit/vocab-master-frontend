// Hàm đọc âm thanh
export function speakText(word, lang, example = "", rate = 0.9) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const textToSpeak = example ? `${word}... ${example}` : word;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Lấy danh sách giọng đọc hiện có
    const voices = window.speechSynthesis.getVoices();

    if (lang === 'CN') {
        utterance.lang = 'zh-CN';
        // Tìm giọng Trung Quốc chất lượng cao (ưu tiên Google hoặc Microsoft)
        const cnVoice = voices.find(v => v.lang === 'zh-CN' && (v.name.includes("Google") || v.name.includes("Microsoft")));
        if (cnVoice) utterance.voice = cnVoice;
    } else {
        utterance.lang = 'en-US';
        // Ưu tiên các giọng "Natural" (trên Edge) hoặc "Google" (trên Chrome)
        // Những giọng này nghe sẽ "người" hơn và hoàn toàn miễn phí
        const preferredVoices = [
            "Microsoft Aria Online", // Giọng nữ rất hay của Edge
            "Google US English",      // Giọng chuẩn của Chrome
            "Microsoft Guy Online",   // Giọng nam hay của Edge
            "English (United States)"
        ];

        let selectedVoice = null;
        for (const name of preferredVoices) {
            selectedVoice = voices.find(v => v.name.includes(name));
            if (selectedVoice) break;
        }

        if (!selectedVoice) {
            selectedVoice = voices.find(v => v.lang.includes("en-US") || v.lang.includes("en_US"));
        }
        
        if (selectedVoice) utterance.voice = selectedVoice;
    }

    utterance.rate = rate; // Tốc độ truyền vào (mặc định 0.9)
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
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