// Đổi tên cache để ép máy tải lại bản mới nhất
const CACHE_NAME = 'vocab-pro-v9';

// Danh sách các file cần lưu Offline (Bao gồm cả thư viện Google và Icon)
const ASSETS = [
  './',
  './index.html',
  './src/assets/style.css',
  './src/app.js',
  './src/firebase-config.js',
  './src/utils.js',
  './src/api.js',
  './src/config.js',
  './src/ai-services.js',
  './src/quiz.js',
  './src/ui.js',
  './manifest.json',
  // Thư viện Firebase bắt buộc phải lưu offline
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js',
  // Lưu luôn cái icon để lúc mất mạng app vẫn có logo
  'https://cdn-icons-png.flaticon.com/512/2232/2232688.png'
];

// 1. Cài đặt Service Worker và tải file vào Cache
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Ép kích hoạt ngay lập tức bản mới không cần chờ
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 1.5. Xóa Cache cũ đi dọn dẹp dung lượng và nhường chỗ cho bản mới
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim(); // Chiếm quyền điều khiển trang web ngay lập tức
});

// 2. Chặn và xử lý khi mất mạng
self.addEventListener('fetch', (e) => {
  // Bỏ qua các request POST/PUT (Vì Firebase dùng cái này để đồng bộ dữ liệu)
  if (e.request.method !== 'GET') return;

  // Bỏ qua các API kết nối trực tiếp đến Database của Google
  // (Để cho Firebase tự lo phần Offline Database của nó)
  if (e.request.url.includes('firestore.googleapis.com')) return;

  // Với các file code/ảnh/css bình thường -> Lấy từ Cache ra dùng
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});