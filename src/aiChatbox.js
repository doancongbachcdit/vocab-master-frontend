// src/aiChatbox.js
import { API_BASE_URL } from './config.js';

class AIChatbox {
    constructor() {
        this.bubble          = document.getElementById('ai-chat-bubble');
        this.window          = document.getElementById('ai-chat-window');
        this.closeBtn        = document.getElementById('ai-chat-close');
        this.messagesContainer = document.getElementById('ai-chat-messages');
        this.input           = document.getElementById('ai-chat-input');
        this.sendBtn         = document.getElementById('ai-chat-send');

        this.MAX_HISTORY_CHARS     = 16000;
        this.TYPEWRITER_SPEED      = 14; // ms per character

        this.history      = JSON.parse(localStorage.getItem('ai_chat_history')) || [];
        this.isOpen       = false;
        this.isTyping     = false;

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

        // Cập nhật context chip khi chatbox mở
        this.renderHistory();
        this.checkInitialBadge();
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
    //  GỬI VÀ NHẬN TIN NHẮN
    // ─────────────────────────────────────────
    async handleSend(text) {
        const message = text || this.input.value.trim();
        if (!message || this.isTyping) return;

        this.input.value = '';
        this.input.style.height = 'auto';

        if (message === '/clear') {
            this.clearHistory();
            return;
        }

        this.addMessage(message, 'user');
        this.saveHistory(message, 'user');

        await this.getAIResponse(message);
    }

    async getAIResponse(prompt) {
        this.isTyping = true;
        this.sendBtn.disabled = true;
        this.showLoader();

        const contextualPrompt = this.buildPrompt(prompt);

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

            // Hiển thị với hiệu ứng typewriter
            await this.addMessageWithTypewriter(aiText, 'ai');
            this.saveHistory(aiText, 'ai');

        } catch (error) {
            this.hideLoader();
            this.addMessage(`❌ Lỗi: ${error.message}. Vui lòng thử lại sau nhé!`, 'ai');
        } finally {
            this.isTyping = false;
            this.sendBtn.disabled = false;
        }
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

    buildPrompt(userPrompt) {
        // const systemInstruction = [
        //     'Bạn là trợ lý AI tổng quát, trả lời được mọi câu hỏi.',
        //     'Hãy trả lời bằng đúng ngôn ngữ người dùng đang dùng.',
        //     'Nếu câu hỏi mơ hồ hoặc thiếu dữ kiện quan trọng, chỉ hỏi lại tối đa 1 câu để làm rõ.',
        //     'Ưu tiên chính xác; nếu không chắc, nói rõ mức độ không chắc và đề xuất cách kiểm chứng.',
        // ].join('\n');
        const systemInstruction = [
            'Bạn là AI chuyên gia giảng dạy tiếng Anh và tiếng Trung (HSK).',
            'Vai trò: giáo viên + trợ giảng + sửa lỗi + tạo bài tập.',
          
            'LUÔN trả lời bằng đúng ngôn ngữ người dùng đang dùng (mặc định: tiếng Việt).',
          
            '--- NGUYÊN TẮC QUAN TRỌNG ---',
            '1. Nếu người dùng viết tiếng Anh/Trung → kiểm tra lỗi và sửa.',
            '2. Giải thích lỗi NGẮN GỌN, dễ hiểu.',
            '3. Luôn đưa ví dụ thực tế (level phù hợp).',
            '4. Nếu người dùng học từ vựng → trả theo FORMAT chuẩn.',
            '5. Nếu người dùng yêu cầu luyện tập → tạo bài tập + đáp án.',
            '6. Không trả lời lan man, ưu tiên dễ học – dễ nhớ.',
            '7. Nếu câu hỏi mơ hồ → chỉ hỏi lại 1 câu để làm rõ.',
          
            '--- FORMAT TỪ VỰNG (BẮT BUỘC) ---',
            'word | pronunciation | meaning | example | level',
            'Ví dụ:',
            'apple | /ˈæp.əl/ | quả táo | I eat an apple every day. | A1',
          
            '--- FORMAT SỬA CÂU ---',
            '❌ Câu sai',
            '✅ Câu đúng',
            '📌 Giải thích ngắn',
          
            '--- FORMAT TIẾNG TRUNG ---',
            '汉字 | pinyin | nghĩa | ví dụ',
            '你好 | nǐ hǎo | xin chào | 你好，我是学生。',
          
            '--- LUYỆN TẬP ---',
            'Nếu người dùng nói "luyện tập" hoặc "quiz":',
            '- Tạo 3–5 câu hỏi',
            '- Có đáp án ở cuối',
            '- Phù hợp trình độ (A1–C1 hoặc HSK1–HSK6)',
          
            '--- CÁ NHÂN HÓA ---',
            'Nếu người dùng không nói level → mặc định B1 (EN) / HSK2 (ZH).',
          
            '--- ĐỘ CHÍNH XÁC ---',
            'Nếu không chắc → nói rõ và đề xuất cách kiểm chứng.',
          ].join('\n');

        const convo = this.getConversationForPrompt();
        const historyBlock = convo.length
            ? `\n\n[HỘI THOẠI TRƯỚC ĐÓ]\n${convo.join('\n')}`
            : '';

        return `${systemInstruction}${historyBlock}\n\n[NGƯỜI DÙNG]\n${userPrompt}\n\n[TRỢ LÝ AI]`;
    }

    getConversationForPrompt() {
        // Lấy các đoạn gần nhất sao cho không vượt quá giới hạn ký tự
        const items = [];
        let charCount = 0;
        for (let i = this.history.length - 1; i >= 0; i--) {
            const msg = this.history[i];
            if (!msg?.text || !msg?.role) continue;

            const line = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${String(msg.text).replace(/\s+/g, ' ').trim()}`;
            if (!line.trim()) continue;

            const nextCount = charCount + line.length + 1;
            if (nextCount > this.MAX_HISTORY_CHARS) break;
            items.push(line);
            charCount = nextCount;
        }
        return items.reverse();
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
        localStorage.removeItem('ai_chat_history');
        this.messagesContainer.innerHTML = `
            <div class="msg-wrapper ai-wrapper" style="animation:slideUpFade 0.3s ease">
                <div class="ai-msg">
                    Lịch sử đã được xóa. Bạn có thể hỏi tôi bất cứ điều gì.
                </div>
                <div class="msg-time">${this.getTimeString()}</div>
            </div>
        `;
    }

    renderHistory() {
        if (this.history.length > 0) {
            this.messagesContainer.innerHTML = '';
            this.history.forEach(msg => this.addMessage(msg.text, msg.role));
        }
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
