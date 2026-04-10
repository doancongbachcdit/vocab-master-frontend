// 1. Cấu hình hằng số (Constants)
export const API_BASE_URL = "https://vocab-master-backend-5gma.onrender.com";
//  export const API_BASE_URL = "https://localhost:7203";

// 2. State App Toàn Cục (Giữ lại Data giữa các File)
// Thay vì dùng biến let lung tung trong app.js, dùng Object trạng thái này:
export const AppState = {
    currentUser: null,
    cachedWords: [],
    dueWords: [],
    quizHistory: [],
    historyIndex: -1,
    isCramMode: false,
    isLoading: false,
    currentQuizItem: null,

    // --- Study session (daily/session cap) ---
    sessionLimit: 30,
    sessionDoneCount: 0,
    sessionQueue: [],      // array of word ids chosen for this session
    sessionSeenIds: new Set(), // prevent repeat-heavy within the same session
    sessionDayKey: ''      // yyyy-mm-dd, reset when day changes
};

// Hàm Reset Data Sạch sẽ (Lúc Logout)
export function resetAppState() {
    AppState.currentUser = null;
    AppState.cachedWords = [];
    AppState.dueWords = [];
    AppState.quizHistory = [];
    AppState.historyIndex = -1;
    AppState.isCramMode = false;
    AppState.isLoading = false;
    AppState.currentQuizItem = null;

    AppState.sessionDoneCount = 0;
    AppState.sessionQueue = [];
    AppState.sessionSeenIds = new Set();
    AppState.sessionDayKey = '';
}
