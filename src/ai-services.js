// src/ai-services.js
import { API_BASE_URL, AppState } from './config.js';

// --- 1. TÍNH NĂNG AI CHẤM BÀI ---
export function gradeAnswer(question, answer, feedbackDiv, btn) {
    btn.disabled = true;
    btn.innerText = "⏳ Đang đọc bài...";
    feedbackDiv.style.display = 'block';
    feedbackDiv.innerHTML = '<span style="color: #64748b; font-style: italic;">🤖 Thầy giáo AI đang phân tích từng từ của Bách...</span>';

    const prompt = `Học sinh vừa trả lời câu hỏi ngôn ngữ sau:
    - Câu hỏi: "${question}"
    - Câu trả lời của học sinh: "${answer}"

    Hãy đóng vai một giáo viên ngôn ngữ xuất sắc, nhận xét câu trả lời này bằng tiếng Việt. Trình bày thân thiện, rõ ràng theo đúng 3 phần sau:
    1. 🎯 Nhận xét & Sửa lỗi: Chỉ ra lỗi ngữ pháp, từ vựng (nếu có). Nếu viết đúng, hãy dành lời khen ngợi.
    2. ✨ Cách nói tự nhiên (Native): Đề xuất 1-2 cách diễn đạt tự nhiên, chuyên nghiệp hơn mà người bản xứ thường dùng.
    3. 💡 Mẹo nhỏ: Giải thích ngắn gọn tại sao lại dùng cấu trúc/từ vựng ở phần 2.
    Lưu ý: Chỉ in ra nội dung, trình bày bằng icon cho sinh động, không cần lời chào hỏi.`;

    fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
    })
        .then(async response => {
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Lỗi máy chủ C#");
            return data;
        })
        .then(data => {
            if (!data.result) throw new Error("AI không trả về kết quả.");
            const feedback = data.result;
            feedbackDiv.innerHTML = `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px; color: #166534;">${feedback.replace(/\n/g, '<br>')}</div>`;
            btn.innerText = "🔄 Chấm lại (Nếu Bách sửa câu)";
            btn.disabled = false;
        })
        .catch(err => {
            feedbackDiv.innerHTML = `<p style="color: red;">❌ Lỗi kết nối: ${err.message}</p>`;
            btn.innerText = "✨ Nhờ Thầy AI chấm";
            btn.disabled = false;
        });
}

// --- 2. TÍNH NĂNG XIN AI GỢI Ý (HINT) ---
export async function getAIHint() {
    // Trỏ vào AppState để lấy currentQuizItem thay vì biến toàn cục
    if (!AppState.currentQuizItem) return;

    const hintBtn = document.getElementById('btnHint');
    const hintArea = document.getElementById('aiHintArea');

    hintBtn.disabled = true;
    hintBtn.style.opacity = '0.5';
    hintArea.style.display = 'block';
    hintArea.innerHTML = '<span style="color: #92400e; font-style: italic;">⏳ Thầy giáo AI đang vắt óc tìm gợi ý...</span>';

    const langName = AppState.currentQuizItem.l === 'CN' ? 'tiếng Trung' : 'tiếng Anh';
    const lang = AppState.currentQuizItem.l;
    const word = AppState.currentQuizItem.w;
    const meaning = AppState.currentQuizItem.m;
    const pinyin = AppState.currentQuizItem.p || '';

    let prompt = "";

    if (lang === 'EN') {
        prompt = `Đóng vai một chuyên gia ngôn ngữ học. Tôi đang cần nhớ từ vựng tiếng Anh: '${word}' (Nghĩa là: ${meaning}).
Hãy cho tôi MỘT gợi ý ngắn gọn bằng tiếng Việt (tối đa 3 câu) để tôi tự đoán ra từ này. BẮT BUỘC tuân thủ:
KHÔNG được nhắc trực tiếp đến từ '${word}' hoặc nghĩa tiếng Việt '${meaning}' trong câu trả lời.
Hãy gợi ý dựa trên giải phẫu từ (Tiền tố/Hậu tố/Gốc từ tiếng Latinh) nếu có.
Hoặc đưa ra một từ đồng nghĩa/trái nghĩa phổ biến.
Giọng điệu hài hước, kích thích sự tò mò, dùng icon cho sinh động.`;
    } else if (lang === 'CN') {
        prompt = `Đóng vai một thầy giáo dạy tiếng Trung cổ điển. Tôi đang cần nhớ từ vựng tiếng Trung: '${word}' (Nghĩa là: ${meaning}, Phiên âm: ${pinyin}).
Hãy cho tôi MỘT gợi ý ngắn gọn bằng tiếng Việt (tối đa 3 câu) để tôi nhớ cách viết và ý nghĩa của từ này. BẮT BUỘC tuân thủ:
KHÔNG dịch thẳng nghĩa '${meaning}' để tôi tự đoán.
Hãy phân tích CHIẾT TỰ (chữ này được ghép từ những bộ thủ nào, ý nghĩa của từng bộ thủ là gì).
Vẽ ra một câu chuyện hình ảnh logic hoặc hài hước liên kết các bộ thủ đó lại với nhau để hình thành nên nghĩa của từ.
Nhắc nhẹ về cách phát âm (${pinyin}) nếu nó là chữ Hình Thanh. Dùng icon cho sinh động.`;
    } else {
        prompt = `Từ vựng hiện tại là "${word}" (${langName}, nghĩa: ${meaning}). Bách đang học và đã quên mất nghĩa của từ này.
Hãy giúp Bách nhớ lại bằng một câu gợi ý tình huống bằng ${langName} siêu dễ hiểu (kiểu điền vào chỗ trống).
QUAN TRỌNG: TUYỆT ĐỐI KHÔNG được dịch trực tiếp nghĩa của từ "${word}" ra tiếng Việt để Bách tự đoán.
Trình bày siêu ngắn gọn (1-2 dòng), dùng icon cho sinh động.`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Lỗi API");

        const hintText = data.result;
        hintArea.innerHTML = `💡 <b>Gợi ý cho Bách:</b><br>${hintText.replace(/\n/g, '<br>')}`;
    } catch (err) {
        hintArea.innerHTML = `❌ Lỗi lấy gợi ý: ${err.message}`;
    } finally {
        hintBtn.disabled = false;
        hintBtn.style.opacity = '1';
    }
}

// --- 3. TẠO CÂU HỎI THỰC CHIẾN BẰNG AI ---
export function generateAIQuestions(rawWords) {
    const qContainer = document.getElementById('practicalQuestions');
    if (!qContainer) return;

    qContainer.innerHTML = '<p style="color: #64748b;">🤖 AI đang suy nghĩ câu hỏi riêng cho bạn...</p>';

    if (rawWords.length > 0) {
        const mainLang = rawWords[0].l;
        const isChinese = (mainLang === 'CN');
        const langName = isChinese ? 'tiếng Trung' : 'tiếng Anh';
        const extraPrompt = isChinese ? ' (Yêu cầu in ra chữ Hán kèm Pinyin)' : '';

        const targetWords = rawWords.filter(w => w.l === mainLang).sort(() => 0.5 - Math.random()).slice(0, 3);
        const wordList = targetWords.map(item => item.w).join(', ');

        const prompt = `Bây giờ bạn là gia sư ${langName} của Bách. Bách vừa ôn tập các từ vựng sau: ${wordList}. Hãy tạo ra đúng ${targetWords.length} câu hỏi giao tiếp bằng ${langName} thật đơn giản, ngắn gọn để Bách luyện trả lời. Mỗi câu BẮT BUỘC phải chứa 1 từ trong danh sách trên. Chỉ in ra các câu hỏi, mỗi câu 1 dòng, tuyệt đối không in thêm bất kỳ chữ nào khác.${extraPrompt}`;

        fetch(`${API_BASE_URL}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        })
            .then(async response => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || "Lỗi máy chủ C#");
                return data;
            })
            .then(data => {
                if (!data.result) throw new Error("AI không trả về kết quả.");

                const aiText = data.result;
                const questions = aiText.split('\n').filter(q => q.trim().length > 0);
                const langCode = isChinese ? 'zh-CN' : 'en-US';

                qContainer.innerHTML = '';
                questions.forEach((q, idx) => {
                    qContainer.innerHTML += `
                    <div style="background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 15px; text-align: left; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <b style="color: var(--primary)">Q${idx + 1}:</b> <span class="ai-q-text">${q}</span>
                        
                        <div style="position: relative; margin-top: 8px;">
                            <textarea class="ai-a-text" placeholder="Gõ phím hoặc bấm micro để trả lời..." style="width:100%; padding:10px; padding-right: 40px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit; resize:vertical; min-height: 60px;"></textarea>
                            <button class="btn-mic" data-lang="${langCode}" title="Bấm để nói" style="position: absolute; right: 5px; top: 5px; background: none; border: none; font-size: 1.5rem; cursor: pointer; transition: 0.2s;">🎙️</button>
                        </div>
                        
                        <div style="text-align: right; margin-top: 8px;">
                            <button class="btn btn-primary btn-grade" style="padding: 6px 15px; font-size: 0.9em; width: auto; margin: 0; background: #10b981; border: none;">✨ Nhờ Thầy AI chấm</button>
                        </div>
                        
                        <div class="ai-feedback" style="margin-top: 15px; display: none; font-size: 0.95em; line-height: 1.6;"></div>
                    </div>`;
                });
            })
            .catch(err => {
                console.error("Chi tiết lỗi AI:", err);
                qContainer.innerHTML = `<p style="color: red;">❌ Kết nối AI thất bại: ${err.message}</p>`;
            });
    } else {
        qContainer.innerHTML = '<p style="color: #64748b;">Bạn chưa học từ vựng nào. Hãy thêm từ và làm bài tập để AI có thể tạo câu hỏi nhé!</p>';
    }
}
