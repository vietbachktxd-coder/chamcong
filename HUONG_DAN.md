# CHẤM CÔNG TCL v3 — Ứng dụng Android (.apk) + Web, tự cập nhật

## Thành phần
| Thư mục | Nội dung |
|---|---|
| `android/` | Ứng dụng Android gốc (Java). Có các chức năng: GPS gốc của máy và phát hiện **Fake GPS**, đọc **Wi-Fi**, **nhắc giờ vào/ra ca** cả khi tắt app, **thông báo nền** (duyệt đơn, cảnh báo, thông báo nội bộ), **tự tải và cài bản mới** |
| `web/` | Giao diện chấm công. App Android nạp giao diện này nên mỗi lần sửa giao diện, mọi máy cập nhật ngay, không cần cài lại |
| `backend/Code.gs` | Máy chủ chạy trên Google Apps Script, lưu dữ liệu vào Google Sheets và ảnh vào Google Drive |
| `.github/workflows/build.yml` | GitHub tự build APK, phát hành bản mới và đưa web lên GitHub Pages sau mỗi lần cập nhật |

## Cài đặt lần đầu
1. **Máy chủ:** tạo Google Sheet, vào Tiện ích mở rộng → Apps Script, dán `Code.gs`, chạy hàm `setup`, rồi Triển khai → Ứng dụng web (Thực thi: Tôi · Truy cập: Bất kỳ ai). Copy URL `/exec`. Nếu muốn email nhắc việc, chạy thêm hàm `installReminder` một lần.
2. **Kho mã GitHub:** dán URL `/exec` vào `web/config.js`. Bật Settings → Pages → Source: **GitHub Actions**. Mỗi lần đẩy mã lên nhánh `main`, GitHub tự build xong sau khoảng 3–5 phút.
3. **Link cài cho nhân viên:** `https://<tài-khoản>.github.io/<repo>/download/`. Mở link trên điện thoại, bấm **Tải ứng dụng**, rồi cài như hướng dẫn hiện trên trang.
4. Đăng nhập **ADMIN / admin123** (app bắt đổi mật khẩu ngay), rồi khai báo:
   - Địa điểm: tọa độ, bán kính, Wi-Fi. Đứng tại văn phòng bấm "📶 Thêm Wi-Fi đang kết nối".
   - Ca làm, ngày lễ, nhân viên.

## Cập nhật bản mới
- Sửa mã rồi đẩy lên `main`. Phiên bản tự tăng (3.0.1, 3.0.2…).
- **Android 12 trở lên:** app tự tải và tự cài đè bản mới, không cần bấm. Máy cũ hơn hiện thông báo "Có bản cập nhật", người dùng chỉ cần bấm **Cập nhật**.
- Lần cập nhật đầu tiên, máy hỏi "Cho phép cài từ nguồn này" một lần.
- Muốn bắt buộc mọi máy cập nhật ngay: thêm `[force]` vào nội dung commit.
- Sửa riêng phần giao diện (`web/`): mọi máy nhận bản mới ngay lần mở kế tiếp.
- Nâng cấp máy chủ: dán `Code.gs` mới, vào Triển khai → Quản lý triển khai → Sửa → Phiên bản mới.

## Chống gian lận (Cấu hình hệ thống)
- **Chỉ cho chấm công bằng app Android:** chặn chấm công từ trình duyệt.
- **Phát hiện vị trí giả lập** (Fake GPS, chế độ vị trí mô phỏng): từ chối và báo ngay cho quản lý.
- **Wi-Fi công ty:** chọn "GPS HOẶC Wi-Fi" (dễ dùng trong nhà kho, nơi GPS yếu) hoặc "GPS VÀ Wi-Fi" (chặt nhất).
- Ngoài ra: ảnh khuôn mặt có in giờ và tọa độ, mỗi tài khoản chỉ dùng 1 máy, giờ chấm lấy theo máy chủ.

## Dữ liệu lớn
Mỗi năm một lần, vào Cấu hình → **Lưu trữ dữ liệu cũ** để chuyển nhật ký chấm công cũ sang file lưu trữ riêng.

## Khóa ký ứng dụng
APK được ký bằng khóa riêng: file đã mã hóa `android/app/release.keystore.enc`, mật khẩu lưu trong GitHub Secret `KS_PASS`. **Không được làm mất khóa này.** Nếu mất, các bản mới sẽ không cài đè lên bản cũ được, nhân viên phải gỡ app rồi cài lại.

## Giới hạn còn lại
- iPhone không cài được file .apk, nên dùng bản web (Safari → Thêm vào MH chính). Bản web không phát hiện được Fake GPS. Vì vậy, khi bật "Chỉ cho chấm công bằng app Android", người dùng iPhone sẽ không chấm công được.
- Android 8–11 vẫn phải bấm "Cập nhật" mỗi lần có bản mới. Đây là quy định của Android đối với ứng dụng không qua CH Play.
- Hãng Xiaomi/Oppo/Vivo có thể chặn tác vụ nền: vào Cài đặt → Pin → **Không hạn chế** cho app.
