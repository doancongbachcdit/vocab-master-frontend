// src/ui.js
import { AppState } from './config.js';
import { speakText } from './utils.js';
import { deleteWordFromBackend } from './api.js';
import { updateSRSStatus } from './quiz.js';
import { deleteWord } from './app.js'; // Tạm mượn hàm deleteWord

// --- HÀM ĐIỀU KHIỂN LOADING TOÀN CỤC ---
export function showLoader(text = "Đang xử lý...") {
    const loader = document.getElementById('globalLoader');
    const textEl = document.getElementById('loaderText');
    if (loader && textEl) {
        textEl.innerText = text;
        loader.style.display = 'flex';
    }
}

export function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// Thêm debounce để tối ưu hóa việc tìm kiếm
let listRenderTimeout;

export function renderList() {
    clearTimeout(listRenderTimeout);
    listRenderTimeout = setTimeout(() => {
        const container = document.getElementById('listContainer');
        const searchInputEl = document.getElementById('search');
        if (!container || !searchInputEl) return;

        const search = searchInputEl.value.toLowerCase();
        container.innerHTML = '';

        // Tối ưu hóa DOM bằng DocumentFragment
        const fragment = document.createDocumentFragment();
        let count = 0;

        for (const item of AppState.cachedWords) {
            if (count > 50 && !search) break;
            if (item.w.toLowerCase().includes(search) || item.m.toLowerCase().includes(search)) {
                const lvl = item.level || 0;
                let color = lvl > 4 ? '#22c55e' : lvl > 2 ? '#f59e0b' : lvl > 0 ? '#ef4444' : '#ccc';
                const isDue = (item.nextReview || 0) <= Date.now();
                const dateStr = (item.nextReview || 0) === 0 ? "Mới" : new Date(item.nextReview).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });

                const div = document.createElement('div');
                div.className = 'vocab-item';
                div.innerHTML = `
                    <div style="flex:1">
                        <div>
                            <span class="level-dot" style="background:${color}" title="Level ${lvl}"></span>
                            <span class="badge ${item.l}">${item.l}</span> <b>${item.w}</b> <small style="color:#666; font-style:italic">${item.p || ''}</small>
                            <button class="btn-list-speak" data-w="${item.w}" data-l="${item.l}" data-ex="${item.ex || ''}" style="border:none;background:none;cursor:pointer">🔊</button>
                        </div>
                        <div style="font-size:0.9em; color:#64748b; margin-top:2px">
                            ${item.m} <span style="float:right; font-size:0.8em; color:${isDue ? 'red' : 'green'}">${isDue ? '⚡ Cần ôn' : '📅 ' + dateStr}</span>
                            ${item.ex ? `<div style="font-style:italic; color:#475569; margin-top:5px;">📝 ${item.ex}</div>` : ''}
                        </div>
                    </div>
                    <button class="btn-list-delete" data-id="${item.id}" style="border:none;background:none;color:#999;cursor:pointer;margin-left:10px">✖</button>
                `;
                fragment.appendChild(div); count++;
            }
        }
        container.appendChild(fragment);
    }, 150);
}

export function switchTab(id) {
    document.querySelectorAll('.content, .tab-btn').forEach(e => e.classList.remove('active'));
    const targetContent = document.getElementById(id);
    if (targetContent) targetContent.classList.add('active');

    const targetBtn = document.querySelector(`button[data-tab="${id}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    if (id === 'list') renderList();
}
