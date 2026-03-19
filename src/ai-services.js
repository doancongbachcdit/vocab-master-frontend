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
        // PROMPT TIẾNG ANH (ÉP GIẢI PHẪU TỪ & ĐIỀN VÀO CHỖ TRỐNG)
        prompt = `Đóng vai chuyên gia ngôn ngữ học hài hước. Nhiệm vụ: Tạo gợi ý để giúp học viên ĐOÁN được từ vựng tiếng Anh đang học.

[Thông tin từ vựng]
- Từ mục tiêu: '${word}'
- Nghĩa tiếng Việt: '${meaning}'

[Cấu trúc ĐẦU RA BẮT BUỘC]
Bạn PHẢI trình bày đúng 2 phần sau, sử dụng định dạng Markdown (in đậm từ khóa) và danh sách (bullet points):

1. 🔍 **Giải phẫu từ / Liên tưởng:**
- NẾU từ có Tiền tố/Hậu tố/Gốc từ (Latinh/Hy Lạp): Hãy mổ xẻ và giải thích ý nghĩa các thành phần đó (VD: "Tiền tố 'un-' nghĩa là không, gốc từ 'believ' là tin...").
- NẾU từ đơn giản không có gốc từ: Đưa ra từ đồng nghĩa/trái nghĩa quen thuộc hoặc nguồn gốc thú vị của từ.
- TUYỆT ĐỐI không được nhắc đến từ '${word}'.

2. 💡 **Tình huống gợi nhớ:**
- Tạo 1 câu ví dụ tiếng Anh thực tế, nhưng thay thế từ mục tiêu bằng "___".
- Cung cấp bản dịch tiếng Việt của câu đó (cũng thay bằng "___"). Dùng icon sinh động.

[Ràng buộc TUYỆT ĐỐI]
1. TUYỆT ĐỐI KHÔNG xuất hiện từ '${word}' trong câu trả lời.
2. TUYỆT ĐỐI KHÔNG xuất hiện nghĩa '${meaning}' trong câu trả lời.
3. KHÔNG chào hỏi dạo đầu hay kết luận. Bắt đầu ngay bằng "1. 🔍 **Giải phẫu từ / Liên tưởng:**".`;

    } else if (lang === 'CN') {
        // PROMPT TIẾNG TRUNG (ÉP CHIẾT TỰ ĐẾN TẬN CÙNG)
        prompt = `Đóng vai một chuyên gia Hán ngữ và bậc thầy về "Chiết tự" (Thuyết văn giải tự). Nhiệm vụ của bạn là "giải phẫu" từ vựng '${word}' (Phiên âm: ${pinyin}, Nghĩa: ${meaning}) để giúp học viên ghi nhớ sâu sắc mặt chữ.

[Cấu trúc ĐẦU RA BẮT BUỘC]
Bạn PHẢI trình bày đúng 3 phần sau, sử dụng định dạng Markdown (in đậm từ khóa) và danh sách (bullet points):

1. 🔍 **Phân tích các bộ thủ (Chiết tự chi tiết):**
- NẾU từ '${word}' là từ ghép (từ 2 chữ Hán trở lên), BẮT BUỘC phải mổ xẻ TỪNG CHỮ MỘT. 
- TUYỆT ĐỐI KHÔNG được trả lời lười biếng kiểu "đây là chữ đơn lẻ không có bộ thủ". Phải phân tích đến tận cùng các bộ thủ/nét cơ bản cấu thành nên nó.
- Giải thích rõ: **Tên bộ thủ/chữ**, hình dáng, và ý nghĩa gốc. (Ví dụ: chữ 学 gồm ⺍, 冖 và 子; chữ 校 gồm 木 và 交).

2. 💡 **Mẹo nhớ (Tưởng tượng câu chuyện):**
- Sáng tạo một câu chuyện siêu hình tượng, sinh động (có tính vật lý, dễ hình dung) liên kết chặt chẽ các bộ thủ nhỏ ở phần 1 để giải thích ý nghĩa '${meaning}'. 
- In đậm các từ khóa tương ứng với bộ thủ trong câu chuyện (VD: vã **mồ hôi**, dưới **mái nhà**, cây **gỗ**...).
- Nếu có thể, thêm 1 mẹo nhớ theo âm Hán Việt.

3. 🌟 **Ứng dụng:**
- Liệt kê 2-3 từ ghép thông dụng chứa chữ '${word}'.
- Format bắt buộc: **Chữ Hán (pinyin):** Nghĩa tiếng Việt.

[Ràng buộc TUYỆT ĐỐI]
1. KHÔNG viết câu chào hỏi dạo đầu hay câu kết luận dư thừa.
2. Bắt đầu ngay lập tức bằng dòng: "1. 🔍 **Phân tích các bộ thủ (Chiết tự chi tiết):**".
3. Trình bày rành mạch, ngắt dòng chuẩn xác.`;
    } else {
        prompt = `Nhiệm vụ: Tạo một câu ví dụ tình huống siêu dễ hiểu (kiểu điền vào chỗ trống) bằng ngôn ngữ ${langName} để giúp học viên tên Bách nhớ lại từ vựng đã quên.

[Thông tin từ vựng]
- Từ mục tiêu: '${word}'
- Nghĩa tiếng Việt: '${meaning}'

[Yêu cầu gợi ý]
- Viết 1-2 câu tình huống mô tả ngữ cảnh sử dụng của từ này.
- Dùng dấu "___" để thay thế cho từ mục tiêu trong câu ví dụ.
- Dùng icon sinh động phù hợp với ngữ cảnh.

[Ràng buộc TUYỆT ĐỐI]
1. KHÔNG xuất hiện từ '${word}' trong câu trả lời.
2. KHÔNG dịch trực tiếp nghĩa '${meaning}' ra tiếng Việt. 
3. Chỉ in ra câu ví dụ có chỗ trống.`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Lỗi API");

        let hintText = data.result;

        // CỰC KỲ QUAN TRỌNG: Render Markdown thành HTML để hiển thị đẹp
        hintText = hintText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); // Biến **chữ in đậm** thành <b>chữ in đậm</b>
        hintText = hintText.replace(/\n/g, '<br>'); // Chuyển dấu xuống dòng thành thẻ <br>

        hintArea.innerHTML = `💡 <b>Gợi ý cho Bách:</b><br><br>${hintText}`;
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
