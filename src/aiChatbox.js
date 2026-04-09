// src/aiChatbox.js
import { API_BASE_URL } from './config.js';

class AIChatbox {
    constructor() {
        this.bubble = document.getElementById('ai-chat-bubble');
        this.window = document.getElementById('ai-chat-window');
        this.closeBtn = document.getElementById('ai-chat-close');
        this.messagesContainer = document.getElementById('ai-chat-messages');
        this.input = document.getElementById('ai-chat-input');
        this.sendBtn = document.getElementById('ai-chat-send');
        this.quickActions = document.getElementById('ai-chat-quick-actions');
        
        this.history = JSON.parse(localStorage.getItem('ai_chat_history')) || [];
        this.isOpen = false;
        this.isTyping = false;
        this.lastSelection = ''; // Bộ nhớ đệm lưu vùng bôi đen

        this.init();
    }

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

        // LẮNG NGHE SỰ KIỆN BÔI ĐEN: Lưu lại ngay lập tức để tránh bị mất khi click vào chat input
        document.addEventListener('selectionchange', () => {
            const selection = window.getSelection().toString().trim();
            if (selection && selection.length > 0) {
                this.lastSelection = selection;
            }
        });

        // Quick Actions
        this.quickActions.addEventListener('click', (e) => {
            if (e.target.id === 'qa-guide') {
                this.showTutorial();
                return;
            }
            const btn = e.target.closest('.qa-btn');
            if (btn) {
                const prompt = btn.getAttribute('data-prompt');
                this.handleSend(prompt);
            }
        });

        this.renderHistory();
        this.checkInitialBadge();
    }

    showTutorial() {
        const tutorialText = `
        🚀 **Hướng dẫn sử dụng AI Trợ lý:**
        
        1. **Vào tab "Học tập":** Khi đang hiện một từ bất kỳ, bạn mở Chatbox và hỏi: *"Giải thích giúp tôi từ đang học này"* -> AI sẽ tự biết đó là từ nào và giải thích cặn kẽ.
        
        2. **Bôi đen văn bản:** Trong tab "Luyện đọc", bạn bôi đen một câu khó và hỏi: *"Dịch giúp tôi đoạn này"* -> AI sẽ lấy đúng đoạn đó để dịch.
        
        3. **Tra từ điển:** Nếu bạn đang mở cửa sổ tra từ nhanh (popup), AI cũng sẽ biết bạn đang quan tâm đến từ đó.
        
        *💡 Mẹo: Hệ thống tự động nhận diện tiếng Anh (EN) và tiếng Trung (CN) để phản hồi chuẩn xác nhất!*`;
        
        this.addMessage(tutorialText, 'ai');
    }

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

    async handleSend(text) {
        const message = text || this.input.value.trim();
        if (!message || this.isTyping) return;

        this.input.value = '';
        this.addMessage(message, 'user');
        this.saveHistory(message, 'user');

        await this.getAIResponse(message);
    }

    addMessage(text, role) {
        const msgDiv = document.createElement('div');
        msgDiv.className = role === 'user' ? 'user-msg' : 'ai-msg';
        
        if (role === 'ai') {
            // Simple Markdown-ish formatting
            let html = text
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Bold
                .replace(/\*(.*?)\*/g, '<i>$1</i>')     // Italic
                .replace(/\n/g, '<br>');                // Newlines
            msgDiv.innerHTML = html;
        } else {
            msgDiv.innerText = text;
        }

        this.messagesContainer.appendChild(msgDiv);
        this.scrollToBottom();
    }

    showLoader() {
        const loader = document.createElement('div');
        loader.className = 'ai-msg chat-loader';
        loader.id = 'chat-typing-loader';
        loader.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        this.messagesContainer.appendChild(loader);
        this.scrollToBottom();
    }

    hideLoader() {
        const loader = document.getElementById('chat-typing-loader');
        if (loader) loader.remove();
    }

    async getAIResponse(prompt) {
        this.isTyping = true;
        this.showLoader();

        const context = this.getSystemContext();
        const contextualPrompt = `[BỐI CẢNH HỆ THỐNG]: ${context}\n\n[CÂU HỎI CỦA NGƯỜI DÙNG]: ${prompt}`;

        try {
            const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: contextualPrompt })
            });

            const data = await response.json();
            this.hideLoader();

            if (!response.ok) throw new Error(data.detail || "Lỗi kết nối");

            const aiText = data.result || "Tôi không nhận được phản hồi từ máy chủ.";
            this.addMessage(aiText, 'ai');
            this.saveHistory(aiText, 'ai');

        } catch (error) {
            this.hideLoader();
            this.addMessage(`❌ Lỗi: ${error.message}. Bách thử lại sau nhé!`, 'ai');
        } finally {
            this.isTyping = false;
        }
    }

    getSystemContext() {
        const activeTab = document.querySelector('.tab-btn.active')?.innerText || 'Không rõ';
        
        // 1. Lấy vùng bôi đen (cache từ lastSelection)
        const currentSelection = window.getSelection().toString().trim();
        const selection = currentSelection || this.lastSelection || '';
        
        let quizContext = '';
        
        // 2. Kiểm tra các chế độ Quiz đang hiển thị
        const modeMultipleChoice = document.getElementById('modeMultipleChoice');
        const modeMatchWords = document.getElementById('modeMatchWords');
        const modeFillBlank = document.getElementById('modeFillBlank');

        if (modeMultipleChoice && modeMultipleChoice.style.display !== 'none') {
            const qWord = document.getElementById('qWord')?.innerText;
            const qMeaning = document.getElementById('qex')?.innerText;
            const qPhonetic = document.getElementById('qPhonetic')?.innerText;
            if (qWord && qWord !== '---') {
                quizContext = `Học viên đang làm trắc nghiệm từ: "${qWord}" ${qPhonetic ? `(${qPhonetic})` : ''}. Nghĩa: ${qMeaning}.`;
            }
        } 
        else if (modeFillBlank && modeFillBlank.style.display !== 'none') {
            const sentence = document.getElementById('fbSentence')?.innerText || '';
            const options = Array.from(document.querySelectorAll('#fbOptions .fb-pill')).map(b => b.innerText).join(', ');
            quizContext = `Học viên đang làm bài tập ĐIỀN VÀO CHỖ TRỐNG. Câu văn: "${sentence.replace(/\n/g, ' ')}". Các lựa chọn: [${options}].`;
        }
        else if (modeMatchWords && modeMatchWords.style.display !== 'none') {
            const cards = Array.from(document.querySelectorAll('.match-card:not(.matched)')).map(c => c.innerText).join(', ');
            quizContext = `Học viên đang làm bài tập NỐI TỪ. Các từ còn lại trên màn hình: [${cards}].`;
        }

        // 3. Dictionary Popup context
        const dictWord = document.getElementById('dict-word')?.innerText;
        const dictPopupActive = document.getElementById('dict-popup')?.classList.contains('active');
        const dictContext = (dictPopupActive && dictWord) ? `Cửa sổ tra từ điển đang mở cho từ: "${dictWord}".` : '';

        return `Vị trí: Tab "${activeTab}". ${quizContext} ${selection ? `Đoạn văn bản bôi đen: "${selection}".` : ''} ${dictContext}`;
    }

    saveHistory(text, role) {
        this.history.push({ text, role });
        if (this.history.length > 20) this.history.shift();
        localStorage.setItem('ai_chat_history', JSON.stringify(this.history));
    }

    renderHistory() {
        if (this.history.length > 0) {
            this.messagesContainer.innerHTML = '';
            this.history.forEach(msg => this.addMessage(msg.text, msg.role));
        }
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

export default AIChatbox;
