// src/api.js
import { API_BASE_URL } from './config.js';
import { db, deleteDoc, doc } from './firebase-config.js';

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

export async function deleteAllWordsFromFirebase(cachedWords) {
    for (const item of cachedWords) {
        await deleteDoc(doc(db, "words", item.id));
    }
}