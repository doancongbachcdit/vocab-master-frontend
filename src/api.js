// src/api.js
import { API_BASE_URL } from './config.js';


export async function fetchAllWords(userId, pageNumber = 1, pageSize = 50) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/vocab/user/${userId}?pageNumber=${pageNumber}&pageSize=${pageSize}`);
        if (!response.ok) throw new Error("Không thể tải dữ liệu từ CSDL");
        return await response.json();
    } catch (error) {
        // Browser sẽ ném TypeError khi bị CORS/network, nên trả thông báo rõ ràng hơn.
        throw new Error("Không kết nối được API (CORS hoặc backend đang lỗi).");
    }
}

export async function addWordToBackend(newItem) {
    const response = await fetch(`${API_BASE_URL}/api/vocab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
    });
    if (!response.ok) throw new Error("Lỗi lưu vào CSDL");
    return await response.json();
}

export async function deleteWordFromBackend(id) {
    const response = await fetch(`${API_BASE_URL}/api/vocab/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error("Lỗi xóa từ CSDL");
}

export async function importCSVToBackend(newItems) {
    // GỬI DỮ LIỆU SANG C# BẰNG PHƯƠNG THỨC POST VÀO ENDPOINT IMPORT
    const response = await fetch(`${API_BASE_URL}/api/vocab/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItems)
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Lỗi lưu vào máy chủ C#");
    }
}

export async function updateWordSRSToBackend(id, newLevel, newNextReview, newEaseFactor, newInterval, wordSnapshot = null) {
    const payload = {
        // Backend PUT often validates core fields; keep original values instead of placeholders.
        w: wordSnapshot?.w || "",
        m: wordSnapshot?.m || "",
        l: wordSnapshot?.l || "EN",
        p: wordSnapshot?.p || "",
        prf: wordSnapshot?.prf || "",
        rt: wordSnapshot?.rt || "",
        suf: wordSnapshot?.suf || "",
        ex: wordSnapshot?.ex || "",
        userId: wordSnapshot?.userId || "",
        level: newLevel,
        nextReview: newNextReview,
        easeFactor: newEaseFactor,
        interval: newInterval
    };

    const response = await fetch(`${API_BASE_URL}/api/vocab/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || "Lỗi đồng bộ C#");
    }
}

/**
 * Xóa toàn bộ từ vựng của user thông qua C# backend API.
 * Xử lý song song theo batch để tăng tốc, tránh timeout.
 */
export async function deleteAllWordsFromBackend(cachedWords) {
    const BATCH_SIZE = 10; // xử lý 10 từ song song cùng lúc
    const words = [...cachedWords]; // clone để tránh mutation
    const errors = [];

    for (let i = 0; i < words.length; i += BATCH_SIZE) {
        const batch = words.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(item => fetch(`${API_BASE_URL}/api/vocab/${item.id}`, { method: 'DELETE' }))
        );
        results.forEach((result, idx) => {
            if (result.status === 'rejected' || (result.value && !result.value.ok)) {
                errors.push(batch[idx].id);
            }
        });
    }

    if (errors.length > 0) {
        throw new Error(`Không thể xóa ${errors.length} từ. Vui lòng thử lại.`);
    }
}