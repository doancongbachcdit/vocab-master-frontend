import http.server
import socketserver

PORT = 8000

Handler = http.server.SimpleHTTPRequestHandler
# Bắt buộc trình duyệt nhận diện file .js là module (Sửa lỗi MIME type của Windows)
Handler.extensions_map['.js'] = 'application/javascript'
Handler.extensions_map['.css'] = 'text/css'
Handler.extensions_map['.html'] = 'text/html'

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"🚀 Server đang chạy ngon lành tại http://localhost:{PORT}")
    print("✅ Đã sửa lỗi màn hình trắng do MIME type script modules của Windows!")
    print("Nhấn Ctrl+C để tắt server.")
    httpd.serve_forever()
