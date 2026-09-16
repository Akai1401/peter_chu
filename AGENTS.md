# Agent Instructions & Workflow Rules

File này chứa các quy tắc bắt buộc áp dụng cho mọi tương tác và tác vụ trong dự án. Agent phải tuân thủ nghiêm ngặt mỗi khi nhận prompt.

---

## 1. Quy chuẩn UI / UX / Frontend (Always Apply `impeccable`)
- **Bắt buộc kích hoạt & áp dụng `impeccable` skill** bất cứ khi nào tạo mới, thiết kế hoặc chỉnh sửa bất kỳ thành phần nào liên quan đến UI/UX/Frontend (React, TSX, Vue, HTML, CSS, Tailwind classes, components, layouts, dialogs, modals, badges,...).
- Đảm bảo tính thẩm mỹ cao cấp (production-grade visual craft), typography trau chuốt, spacing có chủ đích, bảng màu hài hòa, nhất quán theo design system.
- Tuyệt đối không tạo UI sơ sài, generic hay "lạc quẻ" với tổng thể.
- Xử lý đầy đủ tất cả trạng thái của component: `loading`, `empty`, `error`, `active`, `disabled`, `responsive`.

---

## 2. Tiêu chuẩn Mã nguồn & Hậu kiểm (Always Apply `clean-code` & `code-review`)
- **Bắt buộc áp dụng `clean-code` skill (Nguyên lý Uncle Bob)**:
  - Đặt tên biến, hàm, file rõ ràng, thể hiện đúng mục đích (intention-revealing naming).
  - Hàm/function phải ngắn gọn, tuân thủ nguyên lý Đơn nhiệm (Single Responsibility Principle - SRP).
  - Không trùng lặp mã nguồn (DRY), hạn chế lồng ghép sâu (nesting), loại bỏ dead code và unused imports/variables.
  - Xử lý lỗi chặt chẽ, minh bạch, không nuốt lỗi ngầm (silent error swallowing).
- **Bắt buộc áp dụng `code-review` skill**:
  - Tự kiểm tra diff của tất cả các file đã chỉnh sửa trước khi bàn giao cho người dùng.
  - Đảm bảo an toàn kiểu dữ liệu (strict type safety), tuân thủ convention và không gây hồi quy (regression).

---

## 3. Quy trình Kiểm thử & Tự động Sửa lỗi sau khi hoàn thành (Post-Task Verification)
Sau khi thực hiện xong bất kỳ thay đổi mã nguồn, tính năng hoặc sửa lỗi nào, Agent **bắt buộc** thực hiện tuần tự các bước kiểm tra sau:

1. **Chạy Lint**:
   ```bash
   bun run lint
   # (hoặc npm run lint)
   ```
2. **Kiểm tra Kiểu dữ liệu (Typecheck)**:
   ```bash
   bun run typecheck
   # (hoặc npm run typecheck / tsc --noEmit)
   ```
3. **Chạy Test**:
   ```bash
   bun run test
   # (hoặc npm test)
   ```
4. **Kiểm tra Build**:
   ```bash
   bun run build
   # (hoặc npm run build)
   ```
5. **Tự động sửa lỗi (Self-Healing)**:
   - Nếu bất kỳ bước nào ở trên (lint, typecheck, test, build) báo lỗi hoặc cảnh báo nghiêm trọng, Agent **phải tự động phân tích và khắc phục triệt để mọi lỗi phát sinh** cho đến khi toàn bộ các lệnh chạy thành công trước khi hoàn tất phản hồi. Không dừng lại để người dùng phải nhắc sửa lỗi.

---

## 4. Cập nhật Tài liệu (Documentation)
- Cập nhật `README.md` hoặc các tài liệu liên quan trong thư mục `docs/` ngay sau khi hoàn thành công việc nếu có:
  - Tính năng mới hoặc sửa đổi tính năng hiện có.
  - Thay đổi kiến trúc, quy trình làm việc, API hoặc biến môi trường (`.env`).
  - Hướng dẫn cài đặt, cấu hình hoặc lệnh chạy mới.
