# Messenger AI Bot Control Center - Phase 1: Reminder Bot

Monorepo TypeScript quản lý và điều khiển **Messenger AI Bot**, triển khai hoàn thiện **Phase 1: Reminder Bot** phục vụ tự động hoá nhắc lịch qua Messenger Web.

---

## 🚀 Kiến Trúc Hệ Thống (Monorepo)

```
messenger-control-center/
├── packages/
│   └── shared/                 # Shared Types, Zod Schemas, Idempotency & Asia/Ho_Chi_Minh Time Helpers
├── apps/
│   ├── api/                    # Express REST API & SQLite DB (better-sqlite3)
│   ├── worker/                 # Playwright persistent context, Cron Scheduler, Rate Limiter & Lock Manager
│   └── admin/                  # Admin Dashboard (React 18 + Vite + Tailwind/Glassmorphic Dark Mode)
├── package.json                # Workspaces root scripts
└── tsconfig.base.json          # Root TypeScript configuration
```

---

## 🌟 Tính Năng Phase 1 Đã Triển Khai

1. **Admin Dashboard hiện đại (Dark Mode / Glassmorphism)**:
   - **Bot Operations Center**: Giám sát trạng thái bot realtime (`RUNNING`, `STOPPED`, `EMERGENCY_STOPPED`).
   - **Session Status**: Hiển thị tình trạng phiên đăng nhập Messenger Web (`LOGGED_IN`, `UNAUTHENTICATED`, `SESSION_EXPIRED`, `UNKNOWN`).
   - **Điều khiển Bot**: Nút Start, Stop, Restart và **Emergency Stop** (dừng khẩn cấp mọi tiến trình gửi tin có xác nhận).
   - **Chế độ DRY_RUN**: Toggle bật/tắt chế độ gửi an toàn (mặc định `DRY_RUN=true`).
   - **Quản lý Reminders (CRUD)**:
     - Tạo mới, chỉnh sửa, xoá nhắc nhở.
     - Thiết lập khung giờ hoạt động (mặc định: `18:00–22:00`, lặp mỗi `10` phút theo múi giờ `Asia/Ho_Chi_Minh`).
     - Bật / tắt nhanh (Active toggle).
     - **Test Reminder**: Nút gửi thử nghiệm ngay lập tức (ghi log mô phỏng an toàn, không gọi Facebook thật khi dry-run bật).
   - **Lịch gửi tiếp theo (Upcoming Schedules)**: Tính toán và đếm ngược các mốc thời gian gửi tiếp theo trong ngày theo múi giờ Việt Nam (ICT).
   - **Hệ thống Logs trực quan**:
     - *Execution Logs*: Lịch sử gửi, trạng thái (`SUCCESS`, `DRY_RUN`, `SKIPPED_DUPLICATE`, `SKIPPED_RATE_LIMITED`), Idempotency Key, preview nội dung.
     - *Audit Logs*: Nhật ký toàn bộ hành động người dùng (Start/Stop, tạo/sửa reminder, đổi cấu hình).
     - Bộ lọc tìm kiếm và xem chi tiết payload JSON.

2. **Backend API (Express + SQLite)**:
   - Cơ sở dữ liệu SQLite tối ưu với WAL mode (`better-sqlite3`).
   - Tự động sinh schema và migrate bảng: `bot_state`, `reminders`, `execution_logs`, `audit_logs`, `singleton_locks`.
   - Endpoint RESTful đầy đủ cho Bot State, Reminders, Logs, và Upcoming Schedules.

3. **Bot Worker & Playwright Automation**:
   - **Playwright Persistent Context**: Lưu giữ session đăng nhập và cookies tại thư mục `.messenger-session/`.
   - **Scheduler Asia/Ho_Chi_Minh**: Đồng hồ kiểm tra lịch trình chính xác theo múi giờ UTC+7.
   - **Cơ chế Chống Gửi Trùng (Idempotency Lock)**: Tạo khoá `hash(reminderId:threadId:slotKey)` đảm bảo mỗi khung giờ chỉ gửi duy nhất 1 lần.
   - **Singleton Process Lock**: Sử dụng bảng `singleton_locks` với lease TTL để ngăn chặn 2 worker chạy đè lên nhau.
   - **Rate Limiter**: Giới hạn số tin nhắn tối đa mỗi giờ và thời gian nghỉ tối thiểu giữa 2 lần gửi liên tiếp.

---

## 🔒 Cơ Chế An Toàn & Mock trong Phase 1

- **`DRY_RUN=true` mặc định**: Khi ở chế độ này, hệ thống **hoàn toàn không kết nối hay gửi tin nhắn thật** lên Facebook Messenger. Mọi tương tác đều được giả lập an toàn và ghi nhận `DRY_RUN` log.
- **Unit & Integration Tests**: 100% các bài test chạy độc lập trên bộ nhớ và SQLite test database, không bao giờ mở trình duyệt vật lý hoặc gọi mạng ra ngoài.
- **Phần còn Mock ở Phase 1**:
  - Không tích hợp AI / LLM sinh nội dung (giữ nguyên template / tin nhắn tĩnh của reminder theo yêu cầu).
  - Không cá nhân hoá người nhận (personalization).
  - Messenger Web Playwright chỉ kích hoạt khi cấu hình `DRY_RUN=false` với profile trình duyệt thật có sẵn.

---

## 🛠 Hướng Dẫn Cài Đặt & Chạy Local

### 1. Yêu cầu môi trường
- Node.js >= 20 (khuyên dùng Node 22+)
- Bun >= 1.1

### 2. Cài đặt Dependencies
```bash
cd /Users/aiot/Data/peter_chu
bun install
```

### 3. Cấu hình Biến Môi Trường
File `.env` đã được cấu hình mặc định sẵn:
```ini
NODE_ENV=development
PORT=4000
DRY_RUN=true
TZ=Asia/Ho_Chi_Minh
DATABASE_PATH=./data/messenger_bot.db
MESSENGER_USER_DATA_DIR=./.messenger-session
DEFAULT_WINDOW_START=18:00
DEFAULT_WINDOW_END=22:00
DEFAULT_INTERVAL_MINUTES=10
MAX_MESSAGES_PER_HOUR=10
MIN_SECONDS_BETWEEN_MESSAGES=5
```

### 4. Chạy Phát Triển (Development)

Mở 3 terminal riêng biệt để chạy các thành phần:

- **Terminal 1: Chạy API Backend**
  ```bash
  bun run dev:api
  # API chạy tại http://localhost:4000
  ```

- **Terminal 2: Chạy Bot Worker**
  ```bash
  bun run dev:worker
  # Worker khởi động scheduler và Playwright context
  ```

- **Terminal 3: Chạy Admin Dashboard**
  ```bash
  bun run dev:admin
  # Dashboard giao diện mở tại http://localhost:3000
  ```

### 5. Đăng Nhập Tài Khoản Messenger Thật (Khi muốn chạy Live)
Khi muốn gửi tin nhắn thật lên Facebook (tắt chế độ DRY_RUN):
1. Chạy lệnh:
   ```bash
   bun run login:messenger
   ```
2. Cửa sổ Chrome thật sẽ tự động mở trang Facebook Messenger. Bạn tiến hành đăng nhập tài khoản Facebook của bạn 1 lần duy nhất.
3. Sau khi vào được màn hình tin nhắn, script sẽ tự động lưu phiên (cookies & storage) vào thư mục `.messenger-session/` và cập nhật `session_status = 'LOGGED_IN'`.
4. Kể từ lúc này, Bot Worker có thể tự động gửi tin nhắn thật bằng tài khoản này mà không cần đăng nhập lại.

---

## 🧪 Kiểm Thử & Kiểm Tra Chất Lượng Mã Nguồn

Hệ thống cung cấp đầy đủ các scripts chạy đồng thời trên toàn bộ workspaces:

1. **Typecheck (Kiểm tra kiểu dữ liệu TypeScript)**:
   ```bash
   bun run typecheck
   ```
2. **Lint**:
   ```bash
   bun run lint
   ```
3. **Chạy Unit & Integration Tests**:
   ```bash
   bun run test
   ```
4. **Build Production Toàn Bộ Dự Án**:
   ```bash
   bun run build
   ```

---

## 📋 API Endpoints Chính

| Phương thức | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/health` | Kiểm tra tình trạng sức khoẻ API |
| `GET` | `/api/bot/status` | Lấy trạng thái hiện tại của Bot, Session, Dry-Run |
| `POST` | `/api/bot/action` | Gửi lệnh: `START`, `STOP`, `RESTART`, `EMERGENCY_STOP` |
| `POST` | `/api/bot/dry-run` | Bật/tắt chế độ `DRY_RUN` |
| `GET` | `/api/reminders` | Danh sách tất cả reminders |
| `POST` | `/api/reminders` | Tạo nhắc nhở mới |
| `PUT` | `/api/reminders/:id` | Cập nhật nhắc nhở |
| `PATCH` | `/api/reminders/:id/toggle` | Bật/tắt kích hoạt nhắc nhở |
| `DELETE` | `/api/reminders/:id` | Xoá nhắc nhở |
| `POST` | `/api/reminders/:id/test` | Kích hoạt gửi thử nghiệm tức thì |
| `GET` | `/api/schedules/upcoming` | Danh sách các lượt gửi tiếp theo trong ngày |
| `GET` | `/api/logs/execution` | Xem logs thực thi gửi tin |
| `GET` | `/api/logs/audit` | Xem nhật ký kiểm toán hệ thống |
