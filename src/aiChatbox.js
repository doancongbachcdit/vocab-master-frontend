// src/aiChatbox.js
import { API_BASE_URL, AppState } from './config.js';

class AIChatbox {
    constructor() {
        this.bubble          = document.getElementById('ai-chat-bubble');
        this.window          = document.getElementById('ai-chat-window');
        this.closeBtn        = document.getElementById('ai-chat-close');
        this.messagesContainer = document.getElementById('ai-chat-messages');
        this.input           = document.getElementById('ai-chat-input');
        this.sendBtn         = document.getElementById('ai-chat-send');
        this.quickActions    = document.getElementById('ai-chat-quick-actions');
        this.suggestedRepliesContainer = document.getElementById('ai-suggested-replies');
        this.contextLabel    = document.getElementById('ai-context-label');

        this.MAX_SELECTION_CONTEXT = 800;
        this.MAX_HISTORY_CHARS     = 12000;
        this.TYPEWRITER_SPEED      = 14; // ms per character

        this.history      = JSON.parse(localStorage.getItem('ai_chat_history')) || [];
        this.isOpen       = false;
        this.isTyping     = false;
        this.lastSelection = '';
        this.lastUserPrompt = '';   // Để regenerate
        this.lastAIRawText  = '';   // Raw text của response cuối để regenerate

        this.init();
    }

    // ─────────────────────────────────────────
    //  KHỞI TẠO
    // ─────────────────────────────────────────
    init() {
        if (!this.bubble) return;

        this.bubble.addEventListener('click', () => this.toggleChat());
        this.closeBtn.addEventListener('click', () => this.toggleChat(false));
        this.sendBtn.addEventListener('click', () => this.handleSend());

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        // Auto-resize textarea
        this.input.addEventListener('input', () => {
            this.input.style.height = 'auto';
            this.input.style.height = Math.min(this.input.scrollHeight, 90) + 'px';
        });

        // Lưu vùng bôi đen để không mất khi click vào input
        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection().toString().trim();
            if (sel && sel.length > 0) this.lastSelection = sel;
        });

        // Quick Actions
        this.quickActions.addEventListener('click', (e) => {
            if (e.target.id === 'qa-guide')          { this.showTutorial(); return; }
            if (e.target.id === 'qa-clear-history')  { this.clearHistory(); return; }
            if (e.target.id === 'qa-copy-last')      { this.copyLastAIMessage(); return; }
            if (e.target.id === 'qa-regenerate')     { this.regenerateLastResponse(); return; }

            const btn = e.target.closest('.qa-btn');
            if (btn && btn.dataset.prompt) {
                this.handleSend(btn.dataset.prompt);
            }
        });

        // Lắng nghe tab thay đổi để cập nhật context chip
        document.getElementById('mainTabs')?.addEventListener('click', () => {
            setTimeout(() => this.updateContextChip(), 50);
        });

        // Cập nhật context chip khi chatbox mở
        this.renderHistory();
        this.checkInitialBadge();
        this.updateContextChip();

        // Cập nhật chip định kỳ (khi từ quiz thay đổi)
        setInterval(() => { if (this.isOpen) this.updateContextChip(); }, 2500);
    }

    // ─────────────────────────────────────────
    //  TOGGLE CHATBOX
    // ─────────────────────────────────────────
    toggleChat(force) {
        this.isOpen = force !== undefined ? force : !this.isOpen;
        if (this.isOpen) {
            this.window.classList.add('active');
            this.input.focus();
            document.getElementById('chat-badge').style.display = 'none';
            this.updateContextChip();
        } else {
            this.window.classList.remove('active');
        }
    }

    checkInitialBadge() {
        if (this.history.length === 0 && !this.isOpen) {
            document.getElementById('chat-badge').style.display = 'flex';
        }
    }

    // ─────────────────────────────────────────
    //  CONTEXT CHIP
    // ─────────────────────────────────────────
    updateContextChip() {
        if (!this.contextLabel) return;
        const { label } = this.getContextInfo();
        this.contextLabel.textContent = label;
    }

    /**
     * Trả về { label, contextType, contextText } dựa vào trạng thái UI
     */
    getContextInfo() {
        const activeTabEl  = document.querySelector('.tab-btn.active');
        const activeTabId  = activeTabEl?.dataset?.tab || '';
        const activeTabTxt = activeTabEl?.innerText?.trim() || 'Không rõ';

        // Quiz: Multiple Choice
        const modeMultipleChoice = document.getElementById('modeMultipleChoice');
        if (modeMultipleChoice && modeMultipleChoice.style.display !== 'none') {
            const qWord    = document.getElementById('qWord')?.innerText;
            if (qWord && qWord !== '---') {
                return {
                    label: `🧠 Quiz: ${qWord}`,
                    contextType: 'quiz',
                    word: qWord,
                };
            }
        }

        // Quiz: Fill Blank
        const modeFillBlank = document.getElementById('modeFillBlank');
        if (modeFillBlank && modeFillBlank.style.display !== 'none') {
            const targetWord = AppState.currentQuizItem?.w || '';
            return {
                label: targetWord ? `✍️ Điền từ: ${targetWord}` : '✍️ Điền vào chỗ trống',
                contextType: 'fillblank',
                word: targetWord,
            };
        }

        // Quiz: Match Words
        const modeMatchWords = document.getElementById('modeMatchWords');
        if (modeMatchWords && modeMatchWords.style.display !== 'none') {
            return { label: '🔗 Ghép cặp từ', contextType: 'match', word: '' };
        }

        // Dictionary Popup
        const dictPopupActive = document.getElementById('dict-popup')?.classList.contains('active');
        const dictWord        = document.getElementById('dict-word')?.innerText;
        if (dictPopupActive && dictWord) {
            return { label: `📖 Từ điển: ${dictWord}`, contextType: 'dict', word: dictWord };
        }

        // Text selection
        const sel = window.getSelection().toString().trim() || this.lastSelection;
        if (sel && sel.length > 3) {
            const preview = sel.length > 28 ? sel.slice(0, 28) + '…' : sel;
            return { label: `🖊️ Bôi đen: "${preview}"`, contextType: 'selection', word: '' };
        }

        // Tab fallback
        const tabLabels = {
            quiz:      '🧠 Học Tập',
            dictation: '✍️ Chép Chính Tả',
            listening: '🎧 Luyện Nghe',
            reading:   '📰 Luyện Đọc',
            data:      '📂 Dữ Liệu',
            list:      '📚 Danh Sách',
        };
        return {
            label: tabLabels[activeTabId] || activeTabTxt,
            contextType: activeTabId || 'general',
            word: '',
        };
    }

    // ─────────────────────────────────────────
    //  GỬI VÀ NHẬN TIN NHẮN
    // ─────────────────────────────────────────
    async handleSend(text) {
        const message = text || this.input.value.trim();
        if (!message || this.isTyping) return;

        this.input.value = '';
        this.input.style.height = 'auto';
        this.clearSuggestedReplies();
        this.lastUserPrompt = message;

        this.addMessage(message, 'user');
        this.saveHistory(message, 'user');

        await this.getAIResponse(message);
    }

    async getAIResponse(prompt) {
        this.isTyping = true;
        this.sendBtn.disabled = true;
        this.showLoader();

        const context = this.getSystemContext();
        const systemInstruction = [
            '[VAI TRÒ]: Bạn là trợ lý học ngôn ngữ của Vocab Pro.',
            '[NGÔN NGỮ TRẢ LỜI]: Luôn trả lời bằng tiếng Việt.',
            '[PHONG CÁCH]: Trả lời đầy đủ nhưng ngắn gọn, theo dạng 3-6 gạch đầu dòng.',
            '[RÀNG BUỘC]: Mỗi gạch đầu dòng tối đa 1-2 câu, ưu tiên thông tin trọng tâm.',
            '[KHI THIẾU DỮ KIỆN]: Chỉ hỏi lại tối đa 1 câu làm rõ.',
            '[NỘI DUNG]: Tận dụng bối cảnh học tập được cung cấp để trả lời đúng ngữ cảnh.'
        ].join('\n');

        const contextualPrompt = `${systemInstruction}\n\n[BỐI CẢNH HỆ THỐNG]: ${context}\n\n[CÂU HỎI CỦA NGƯỜI DÙNG]: ${prompt}`;

        try {
            const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: contextualPrompt })
            });

            const data = await response.json();
            this.hideLoader();

            if (!response.ok) throw new Error(data.detail || 'Lỗi kết nối');

            const aiText = data.result || 'Tôi không nhận được phản hồi từ máy chủ.';
            this.lastAIRawText = aiText;

            // Hiển thị với hiệu ứng typewriter
            await this.addMessageWithTypewriter(aiText, 'ai');
            this.saveHistory(aiText, 'ai');

            // Hiển thị suggested replies sau khi AI trả lời xong
            const { contextType } = this.getContextInfo();
            this.showSuggestedReplies(contextType);

        } catch (error) {
            this.hideLoader();
            this.addMessage(`❌ Lỗi: ${error.message}. Vui lòng thử lại sau nhé!`, 'ai');
        } finally {
            this.isTyping = false;
            this.sendBtn.disabled = false;
        }
    }

    async regenerateLastResponse() {
        if (!this.lastUserPrompt || this.isTyping) return;
        // Xóa message AI cuối
        const lastWrapper = this.messagesContainer.querySelector('.ai-wrapper:last-child');
        if (lastWrapper) lastWrapper.remove();
        this.clearSuggestedReplies();
        await this.getAIResponse(this.lastUserPrompt);
    }

    // ─────────────────────────────────────────
    //  THÊM TIN NHẮN
    // ─────────────────────────────────────────
    addMessage(text, role) {
        const wrapper = document.createElement('div');
        wrapper.className = `msg-wrapper ${role === 'ai' ? 'ai-wrapper' : 'user-wrapper'}`;

        const msgDiv = document.createElement('div');
        msgDiv.className = role === 'user' ? 'user-msg' : 'ai-msg';

        if (role === 'ai') {
            msgDiv.innerHTML = this.renderMarkdown(text);
        } else {
            msgDiv.innerText = text;
        }
        wrapper.appendChild(msgDiv);

        // Timestamp
        const timeEl = document.createElement('div');
        timeEl.className = 'msg-time';
        timeEl.textContent = this.getTimeString();
        wrapper.appendChild(timeEl);

        // Action buttons (chỉ cho AI message)
        if (role === 'ai') {
            const actions = this.createMessageActions(text, wrapper);
            wrapper.appendChild(actions);
        }

        this.messagesContainer.appendChild(wrapper);
        this.scrollToBottom();
        return wrapper;
    }

    /**
     * Thêm tin nhắn AI với hiệu ứng typewriter
     */
    async addMessageWithTypewriter(text, role) {
        const wrapper = document.createElement('div');
        wrapper.className = `msg-wrapper ${role === 'ai' ? 'ai-wrapper' : 'user-wrapper'}`;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-msg';
        msgDiv.innerHTML = '';
        wrapper.appendChild(msgDiv);

        this.messagesContainer.appendChild(wrapper);
        this.scrollToBottom();

        // Typewriter
        await this.typewriterEffect(msgDiv, text);

        // Timestamp sau khi xong
        const timeEl = document.createElement('div');
        timeEl.className = 'msg-time';
        timeEl.textContent = this.getTimeString();
        wrapper.appendChild(timeEl);

        // Action buttons
        const actions = this.createMessageActions(text, wrapper);
        wrapper.appendChild(actions);

        this.scrollToBottom();
        return wrapper;
    }

    /**
     * Typewriter effect: render markdown dần dần
     */
    async typewriterEffect(element, rawText) {
        // Thêm cursor giả
        const cursor = document.createElement('span');
        cursor.className = 'typing-cursor';
        element.appendChild(cursor);

        const plainChunks = this.splitIntoChunks(rawText);
        let displayed = '';

        for (const chunk of plainChunks) {
            displayed += chunk;
            // Render markdown lên đến điểm hiện tại
            element.innerHTML = this.renderMarkdown(displayed);
            element.appendChild(cursor);
            this.scrollToBottom();
            await this.sleep(this.TYPEWRITER_SPEED);
        }

        // Xóa cursor khi xong
        cursor.remove();
        // Render lần cuối đầy đủ
        element.innerHTML = this.renderMarkdown(rawText);
    }

    /**
     * Chia text thành các chunk để typewriter (theo ký tự hoặc từ)
     */
    splitIntoChunks(text) {
        // Chia theo từng ký tự nhưng skip dấu markdown
        return text.split('');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Tạo action buttons cho AI message (copy, thumb)
     */
    createMessageActions(rawText, wrapper) {
        const actions = document.createElement('div');
        actions.className = 'msg-actions';

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'msg-action-btn';
        copyBtn.innerHTML = '📋 Copy';
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(rawText);
                copyBtn.innerHTML = '✅ Đã copy!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = '📋 Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch {
                copyBtn.innerHTML = '❌ Lỗi';
                setTimeout(() => { copyBtn.innerHTML = '📋 Copy'; }, 2000);
            }
        });
        actions.appendChild(copyBtn);

        // Thumb up
        const thumbUp = document.createElement('button');
        thumbUp.className = 'msg-action-btn thumb-up';
        thumbUp.innerHTML = '👍';
        thumbUp.title = 'Câu trả lời tốt';
        thumbUp.addEventListener('click', () => {
            thumbUp.classList.toggle('active');
            thumbDown.classList.remove('active');
        });
        actions.appendChild(thumbUp);

        // Thumb down
        const thumbDown = document.createElement('button');
        thumbDown.className = 'msg-action-btn thumb-down';
        thumbDown.innerHTML = '👎';
        thumbDown.title = 'Câu trả lời chưa tốt';
        thumbDown.addEventListener('click', () => {
            thumbDown.classList.toggle('active');
            thumbUp.classList.remove('active');
        });
        actions.appendChild(thumbDown);

        return actions;
    }

    // ─────────────────────────────────────────
    //  SUGGESTED REPLIES
    // ─────────────────────────────────────────
    showSuggestedReplies(contextType) {
        if (!this.suggestedRepliesContainer) return;
        this.clearSuggestedReplies();

        const suggestions = this.getSmartSuggestions(contextType);
        if (!suggestions.length) return;

        suggestions.forEach(text => {
            const btn = document.createElement('button');
            btn.className = 'suggested-reply';
            btn.textContent = text;
            btn.addEventListener('click', () => {
                this.clearSuggestedReplies();
                this.handleSend(text);
            });
            this.suggestedRepliesContainer.appendChild(btn);
        });
    }

    getSmartSuggestions(contextType) {
        const { word } = this.getContextInfo();
        const w = word || 'từ này';

        const map = {
            quiz:      [
                `Cho ví dụ thực tế khác với "${w}"`,
                `Từ đồng nghĩa và trái nghĩa của "${w}"?`,
                `Cách nhớ "${w}" lâu hơn?`,
            ],
            fillblank: [
                `Giải thích cách dùng "${w}" trong câu`,
                `Các cụm từ thường gặp với "${w}"`,
            ],
            match:     [
                'Gợi ý mẹo ghi nhớ nhanh',
                'Từ nào khó nhất trong nhóm này?',
            ],
            dict:      [
                `Thêm 2 ví dụ cho "${w}"`,
                `"${w}" dùng trong lĩnh vực nào?`,
                `Từ liên quan đến "${w}"`,
            ],
            selection: [
                'Dịch đoạn này sang tiếng Việt',
                'Phân tích ngữ pháp câu này',
                'Giải thích nghĩa chi tiết hơn',
            ],
            reading:   [
                'Tóm tắt bài viết này',
                'Liệt kê từ vựng IT quan trọng trong bài',
            ],
            dictation: [
                'Phân tích câu vừa nghe',
                'Giải thích ngữ pháp câu này',
            ],
            listening: [
                'Giới thiệu về kênh này',
                'Gợi ý từ vựng học từ video',
            ],
            general:   [
                'Tôi nên học từ vựng như thế nào?',
                'Phương pháp SRS là gì?',
            ],
        };

        return map[contextType] || map['general'];
    }

    clearSuggestedReplies() {
        if (this.suggestedRepliesContainer) {
            this.suggestedRepliesContainer.innerHTML = '';
        }
    }

    // ─────────────────────────────────────────
    //  CONTEXT SYSTEM (gửi lên AI)
    // ─────────────────────────────────────────
    getSystemContext() {
        const { label, contextType } = this.getContextInfo();
        const activeTab = document.querySelector('.tab-btn.active')?.innerText || 'Không rõ';

        // 1. Selection
        const currentSelection = window.getSelection().toString().trim();
        const rawSelection = currentSelection || this.lastSelection || '';
        const selection = rawSelection.length > this.MAX_SELECTION_CONTEXT
            ? `${rawSelection.slice(0, this.MAX_SELECTION_CONTEXT)}...`
            : rawSelection;

        let quizContext = '';

        // 2. Quiz modes
        const modeMultipleChoice = document.getElementById('modeMultipleChoice');
        const modeMatchWords     = document.getElementById('modeMatchWords');
        const modeFillBlank      = document.getElementById('modeFillBlank');

        if (modeMultipleChoice && modeMultipleChoice.style.display !== 'none') {
            const qWord     = document.getElementById('qWord')?.innerText;
            const qMeaning  = AppState.currentQuizItem?.m || '';
            const qExample  = AppState.currentQuizItem?.ex || '';
            const qPhonetic = document.getElementById('qPhonetic')?.innerText;
            if (qWord && qWord !== '---') {
                quizContext = `Học viên đang làm trắc nghiệm từ: "${qWord}" ${qPhonetic ? `(${qPhonetic})` : ''}. Nghĩa: "${qMeaning}". ${qExample ? `Ví dụ: "${qExample}".` : ''}`;
            }
        } else if (modeFillBlank && modeFillBlank.style.display !== 'none') {
            const sentence   = document.getElementById('fbSentence')?.innerText || '';
            const options    = Array.from(document.querySelectorAll('#fbOptions .fb-pill')).map(b => b.innerText).join(', ');
            const targetWord = AppState.currentQuizItem?.w || '';
            const targetMeaning = AppState.currentQuizItem?.m || '';
            quizContext = `Học viên đang làm bài ĐIỀN VÀO CHỖ TRỐNG. Câu văn: "${sentence.replace(/\n/g, ' ')}". Các lựa chọn: [${options}]. ${targetWord ? `Từ mục tiêu: "${targetWord}"` : ''}${targetMeaning ? `, nghĩa: "${targetMeaning}".` : '.'}`;
        } else if (modeMatchWords && modeMatchWords.style.display !== 'none') {
            const cards = Array.from(document.querySelectorAll('.match-card:not(.matched)')).map(c => c.innerText).join(', ');
            quizContext = `Học viên đang làm bài NỐI TỪ. Các từ còn lại: [${cards}].`;
        }

        // 3. Dictionary Popup
        const dictWord        = document.getElementById('dict-word')?.innerText;
        const dictPhonetic    = document.getElementById('dict-phonetic')?.innerText || '';
        const dictMeaningRaw  = document.getElementById('dict-meaning')?.innerText || '';
        const dictMeaning     = dictMeaningRaw.length > 300 ? `${dictMeaningRaw.slice(0, 300)}...` : dictMeaningRaw;
        const dictPopupActive = document.getElementById('dict-popup')?.classList.contains('active');
        const dictContext     = (dictPopupActive && dictWord)
            ? `Cửa sổ tra từ điển đang mở cho từ: "${dictWord}" ${dictPhonetic ? `(${dictPhonetic})` : ''}. Nghĩa: "${dictMeaning}".`
            : '';

        // 4. SRS progress
        const dueCount = AppState.dueWords?.length || 0;
        const done     = AppState.sessionDoneCount || 0;
        const limit    = AppState.sessionLimit || 30;
        const progressContext = `SRS: due=${dueCount}, session=${done}/${limit}.`;

        return `Vị trí: Tab "${activeTab}". ${progressContext} ${quizContext} ${selection ? `Đoạn văn bản bôi đen: "${selection}".` : ''} ${dictContext}`.trim();
    }

    // ─────────────────────────────────────────
    //  LOADER
    // ─────────────────────────────────────────
    showLoader() {
        const loader = document.createElement('div');
        loader.className = 'ai-msg chat-loader';
        loader.id = 'chat-typing-loader';
        loader.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        this.messagesContainer.appendChild(loader);
        this.scrollToBottom();
    }

    hideLoader() {
        document.getElementById('chat-typing-loader')?.remove();
    }

    // ─────────────────────────────────────────
    //  HISTORY
    // ─────────────────────────────────────────
    saveHistory(text, role) {
        this.history.push({ text, role });
        while (this.history.length > 30) this.history.shift();
        while (this.getHistoryCharCount() > this.MAX_HISTORY_CHARS && this.history.length > 2) {
            this.history.shift();
        }
        localStorage.setItem('ai_chat_history', JSON.stringify(this.history));
    }

    getHistoryCharCount() {
        return this.history.reduce((sum, item) => sum + (item.text?.length || 0), 0);
    }

    clearHistory() {
        this.history = [];
        this.lastUserPrompt = '';
        this.lastAIRawText  = '';
        localStorage.removeItem('ai_chat_history');
        this.clearSuggestedReplies();
        this.messagesContainer.innerHTML = `
            <div class="msg-wrapper ai-wrapper" style="animation:slideUpFade 0.3s ease">
                <div class="ai-msg">
                    Lịch sử đã được xóa. Hãy hỏi tôi bất cứ điều gì! 😊
                </div>
                <div class="msg-time">${this.getTimeString()}</div>
            </div>
        `;
    }

    async copyLastAIMessage() {
        const lastAi = [...this.history].reverse().find(msg => msg.role === 'ai');
        if (!lastAi?.text) {
            this.addMessage('Chưa có câu trả lời AI nào để sao chép.', 'ai');
            return;
        }
        try {
            await navigator.clipboard.writeText(lastAi.text);
            this.addMessage('✅ Đã sao chép câu trả lời AI gần nhất vào clipboard!', 'ai');
        } catch {
            this.addMessage('Không thể sao chép tự động. Vui lòng copy thủ công.', 'ai');
        }
    }

    renderHistory() {
        if (this.history.length > 0) {
            this.messagesContainer.innerHTML = '';
            this.history.forEach(msg => this.addMessage(msg.text, msg.role));
        }
    }

    // ─────────────────────────────────────────
    //  TUTORIAL
    // ─────────────────────────────────────────
    showTutorial() {
        const tutorialText = `🚀 **Hướng dẫn sử dụng AI Trợ lý:**

1. **Đang học Quiz:** Khi từ hiển thị trên màn hình, hỏi: *"Giải thích từ này"* → AI biết ngay đó là từ nào.

2. **Bôi đen văn bản:** Bôi một câu bất kỳ rồi hỏi *"Dịch đoạn này"* → AI dùng đúng đoạn đó.

3. **Tra từ điển:** Khi popup từ điển đang mở, AI tự biết bạn đang xem từ gì.

4. **Suggested Replies:** Sau mỗi câu trả lời, AI gợi ý câu hỏi tiếp theo thông minh.

5. **Nút Thử lại 🔄:** Nếu câu trả lời chưa ưng, bấm để AI trả lời lại.

*💡 Context chip (góc trên) cho bạn biết AI đang "nhìn" gì nhé!*`;

        this.addMessage(tutorialText, 'ai');
    }

    // ─────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────
    renderMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/`(.*?)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:0.9em">$1</code>')
            .replace(/\n/g, '<br>');
    }

    getTimeString() {
        const now = new Date();
        return now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

export default AIChatbox;
