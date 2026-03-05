// 1. Cấu hình hằng số (Constants)
export const API_BASE_URL = "https://vocab-master-backend-5gma.onrender.com";
export const SRS_INTERVALS = [0, 1, 3, 7, 14, 30, 90, 180];

// 2. State App Toàn Cục (Giữ lại Data giữa các File)
// Thay vì dùng biến let lung tung trong app.js, dùng Object trạng thái này:
export const AppState = {
    currentUser: null,
    cachedWords: [],
    dueWords: [],
    quizHistory: [],
    historyIndex: -1,
    isCramMode: false,
    currentQuizItem: null
};

// Hàm Reset Data Sạch sẽ (Lúc Logout)
export function resetAppState() {
    AppState.currentUser = null;
    AppState.cachedWords = [];
    AppState.dueWords = [];
    AppState.quizHistory = [];
    AppState.historyIndex = -1;
    AppState.isCramMode = false;
    AppState.currentQuizItem = null;
}
