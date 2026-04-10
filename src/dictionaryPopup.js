import { API_BASE_URL } from './config.js';
import { speakText } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('dict-popup');
    if (!popup) return;

    const popupWord = document.getElementById('dict-word');
    const popupPhonetic = document.getElementById('dict-phonetic');
    const popupMeaning = document.getElementById('dict-meaning');
    const backdrop = document.getElementById('dict-backdrop');

    // Toolbar elements
    const audioBtn = document.getElementById('dict-audio-btn');
    const favoriteBtn = document.getElementById('dict-favorite-btn');
    const themeBtn = document.getElementById('dict-theme-btn');
    const settingsBtn = document.getElementById('dict-settings-btn');
    const closeBtn = document.getElementById('dict-close-btn');

    let popupOpenedAt = 0;
    const POPUP_CLOSE_COOLDOWN_MS = 500;
    let currentWordData = { word: '', phonetic: '', meaning: '', audioUrl: '', lang: 'EN' };
    const dictMissCache = new Set();
    let lastLookup = { text: '', at: 0 };

    // --- Toolbar Logic ---
    audioBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const { word, audioUrl, lang } = currentWordData;
        if (audioUrl) {
            new Audio(audioUrl).play().catch(() => speakText(word, lang));
        } else if (word) {
            speakText(word, lang);
        }
    });

    closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopup();
    });

    favoriteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        alert('Đã thêm vào mục yêu thích (Demo)');
    });

    themeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('dark-mode');
        alert('Chuyển đổi giao diện (Demo)');
    });

    settingsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        alert('Cài đặt từ điển (Demo)');
    });

    function openPopup() {
        popupOpenedAt = Date.now();
        popup.classList.add('active');
        if (window.innerWidth <= 768 && backdrop) backdrop.classList.add('active');
    }

    function closePopup() {
        popup.classList.remove('active');
        backdrop?.classList.remove('active');
    }

    backdrop?.addEventListener('click', closePopup);

    // --- Selection Logic ---
    document.addEventListener('mouseup', (e) => { if (!isMobile()) handleSelection(e); });
    document.addEventListener('dblclick', (e) => { if (!isMobile()) handleSelection(e); });
    document.addEventListener('mousedown', (e) => {
        if (isMobile()) return;
        if (!popup.contains(e.target)) closePopup();
    });

    let pendingSelectedText = '';
    document.addEventListener('selectionchange', () => {
        if (!isMobile()) return;
        const text = window.getSelection().toString().trim();
        pendingSelectedText = (text.length > 0 && text.length <= 500) ? text : '';
    });

    document.addEventListener('touchend', () => {
        if (!isMobile()) return;
        setTimeout(() => {
            const finalText = window.getSelection().toString().trim() || pendingSelectedText;
            if (finalText.length > 0 && finalText.length <= 500) showMobilePopup(finalText);
            pendingSelectedText = '';
        }, 120);
    });

    document.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        if (Date.now() - popupOpenedAt < POPUP_CLOSE_COOLDOWN_MS) return;
        if (!popup.contains(e.target) && e.target !== backdrop) closePopup();
    }, { passive: true });

    function isMobile() { return window.matchMedia('(hover: none) and (pointer: coarse)').matches; }

    async function showMobilePopup(text) {
        if (shouldSkipDuplicateLookup(text)) return;
        popup.style.top = '';
        popup.style.left = '';
        preparePopup(text);
        openPopup();
        await fetchFullDefinition(text);
    }

    async function handleSelection(event) {
        if (popup.contains(event.target)) return;
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 0 && text.length <= 500) {
            if (shouldSkipDuplicateLookup(text)) return;
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const top = rect.bottom + window.scrollY + 12;
            let left = rect.left + window.scrollX;

            const popupWidth = 300;
            if (left + popupWidth > window.innerWidth - 20) left = window.innerWidth - popupWidth - 20;
            if (left < 10) left = 10;

            popup.style.top = `${top}px`;
            popup.style.left = `${left}px`;
            
            preparePopup(text);
            openPopup();
            await fetchFullDefinition(text);
        } else {
            closePopup();
        }
    }

    function preparePopup(text) {
        popupWord.innerText = '';
        popupPhonetic.innerText = '';
        popupMeaning.innerHTML = '<div class="pos-section"><div class="pos-meanings">⏳ Đang tìm kiếm...</div></div>';
        currentWordData = { word: text, phonetic: '', meaning: '', audioUrl: '', lang: 'EN' };
    }

    function shouldSkipDuplicateLookup(text) {
        const normalized = (text || '').trim().toLowerCase();
        if (!normalized) return true;
        const now = Date.now();
        if (normalized === lastLookup.text && (now - lastLookup.at) < 600) {
            return true;
        }
        lastLookup = { text: normalized, at: now };
        return false;
    }

    function isSingleEnglishWord(text) {
        const clean = (text || '').trim();
        if (!clean) return false;
        // Only one token for dictionaryapi, otherwise fall back to translate.
        if (clean.split(/\s+/).length !== 1) return false;
        return /^[A-Za-z][A-Za-z\-']*$/.test(clean);
    }

    async function fetchFullDefinition(word) {
        const normalizedWord = (word || '').trim().toLowerCase();
        const isEnglish = isSingleEnglishWord(word);
        currentWordData.lang = isEnglish ? 'EN' : 'CN';

        if (!isEnglish) {
            popupWord.innerText = word;
            await renderSimpleTranslation(word);
            return;
        }

        if (dictMissCache.has(normalizedWord)) {
            await renderSimpleTranslation(word);
            return;
        }

        try {
            const [dictRes, transRes] = await Promise.all([
                fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`),
                fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=at&dt=bd&dt=rm&q=${encodeURIComponent(word)}`)
            ]);

            const dictData = dictRes.ok ? await dictRes.json() : null;
            const transData = transRes.ok ? await transRes.json() : null;

            if (!dictRes.ok) {
                dictMissCache.add(normalizedWord);
            }

            renderStructuredResult(word, dictData, transData);
        } catch (error) {
            await renderSimpleTranslation(word);
        }
    }

    function renderStructuredResult(word, dictData, transData) {
        let html = '';
        let phonetic = '';
        let audioUrl = '';

        // Extract Audio and Phonetic from Dictionary API
        if (dictData && dictData[0]) {
            const entry = dictData[0];
            phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '';
            audioUrl = entry.phonetics?.find(p => p.audio)?.audio || '';
        }

        // Extract Transliteration from Google if Dictionary API failed
        if (!phonetic && transData?.[0]?.[1]?.[3]) phonetic = `/${transData[0][1][3]}/`;
        
        popupWord.innerText = (transData?.[0]?.[0]?.[0] || word).toLowerCase();
        popupPhonetic.innerText = phonetic;
        currentWordData.audioUrl = audioUrl;

        // Render Dictionary Sections (dt=bd from Google)
        const dictBlocks = transData?.[1];
        if (dictBlocks && Array.isArray(dictBlocks)) {
            dictBlocks.forEach(block => {
                const pos = block[0]; // e.g., "verb", "noun"
                const meanings = block[1]?.join(', ');
                if (pos && meanings) {
                    html += `
                        <div class="pos-section">
                            <div class="pos-label">${pos.charAt(0).toUpperCase() + pos.slice(1)}</div>
                            <div class="pos-meanings">${meanings}</div>
                        </div>
                    `;
                }
            });
        }

        // Fallback for simple translation
        if (!html && transData?.[0]?.[0]?.[0]) {
            html = `<div class="pos-section"><div class="pos-meanings">${transData[0][0][0]}</div></div>`;
        }

        popupMeaning.innerHTML = html || '<div class="pos-section">Không tìm thấy nghĩa.</div>';
    }

    async function renderSimpleTranslation(word) {
        try {
            const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(word)}`);
            const data = await res.json();
            const translation = data?.[0]?.[0]?.[0] || word;
            popupWord.innerText = translation;
            popupMeaning.innerHTML = `<div class="pos-section"><div class="pos-meanings">${translation}</div></div>`;
        } catch {
            popupMeaning.innerHTML = '<div class="pos-section">Lỗi dịch văn bản.</div>';
        }
    }
});
