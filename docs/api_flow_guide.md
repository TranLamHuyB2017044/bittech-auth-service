# Hướng dẫn Luồng Tương tác API và Tích hợp Client-Backend (AuthService)

Tài liệu này hướng dẫn chi tiết cách Client (Mobile/Frontend) tương tác với Backend của bạn, và luồng tự động bọc gọi từ Backend của bạn tới hệ thống **AuthService** của Bittech sử dụng thư viện `@TranLamHuyB2017044/bittech-auth-service`.

---

## 1. Cài đặt thư viện

Thư viện được phân phối dưới dạng scoped package trên **GitHub Packages**. Bạn có thể cài đặt bằng một trong hai cách dưới đây:

### Cách 1: Cài đặt từ GitHub Packages (Khuyên dùng)

1. Tạo hoặc bổ sung vào tệp `.npmrc` ở gốc dự án Backend của bạn cấu hình registry và Token:
   ```ini
   @TranLamHuyB2017044:registry=https://npm.pkg.github.com/
   //npm.pkg.github.com/:_authToken=YOUR_GITHUB_PERSONAL_ACCESS_TOKEN
   ```
   > [!IMPORTANT]
   > Thay thế `YOUR_GITHUB_PERSONAL_ACCESS_TOKEN` bằng mã Token truy cập cá nhân (GitHub Personal Access Token - PAT) có quyền `read:packages`.

2. Chạy lệnh cài đặt package:
   ```bash
   npm install @TranLamHuyB2017044/bittech-auth-service
   ```

### Cách 2: Cài đặt trực tiếp từ Git Repository qua SSH

Nếu không muốn đăng nhập/xác thực registry, bạn có thể tải trực tiếp từ repository riêng tư qua SSH (yêu cầu máy chủ/máy phát triển có sẵn SSH Key cấu hình với GitHub):
```bash
npm install git+ssh://git@github.com:TranLamHuyB2017044/bittech-auth-service.git
```

Đồng thời, hãy cài đặt các peer dependencies cần thiết (nếu dự án của bạn chưa cài đặt):

```bash
npm install @prisma/client express
```

---

### 1.2. Publish package lên GitHub Packages (Dành cho Developer của thư viện)

Package được cấu hình tự động publish qua **GitHub Actions** khi có Release mới trên GitHub.

#### Cách 1: Publish tự động qua GitHub Release
1. Vào trang repository trên GitHub → **Releases** → **Draft a new release**
2. Tạo tag mới theo chuẩn `v1.x.x`, điền mô tả release rồi nhấn **Publish release**
3. GitHub Actions workflow `.github/workflows/publish.yml` sẽ tự động chạy: build → publish

#### Cách 2: Chạy thủ công (workflow_dispatch)
1. Vào **Actions** → chọn workflow **Publish to GitHub Packages** → **Run workflow**
2. Chọn loại bump version (`patch` / `minor` / `major`) → **Run workflow**
3. Workflow sẽ tự bump version, commit tag, và publish

#### Publish thủ công từ máy local
Cần có PAT với quyền `write:packages`, cấu hình `.npmrc.local` (không commit lên git):
```ini
@TranLamHuyB2017044:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT_WITH_WRITE_PACKAGES
```
Sau đó chạy:
```bash
npm run build
npm publish
```

> [!WARNING]
> Không hardcode PAT token vào `.npmrc` rồi commit lên git. Hãy lưu token vào `.npmrc.local` (đã được thêm vào `.gitignore`) hoặc dùng biến môi trường `GITHUB_TOKEN`.



## 2. Kiến trúc luồng đi của dữ liệu

```
┌──────────────────┐               (1) Gọi API local              ┌──────────────────┐
│  Client (Mobile) │ ───────────────────────────────────────────> │ Backend của bạn  │
└──────────────────┘                                              │ (Package Router) │
         ▲                                                        └──────────────────┘
         │                                                                  │
         │ (4) Trả kết quả                                                  │ (2) Tự đóng gói chữ ký,
         │                                                                  │     nonce, timestamp
         │                                                                  ▼
┌──────────────────┐            (3) Kết quả API remote            ┌──────────────────┐
│  Client (Mobile) │ <─────────────────────────────────────────── │    AuthService   │
└──────────────────┘                                              └──────────────────┘
```

---

## 3. Chi tiết luồng xử lý và tương tác API

### ── Luồng 1: Đăng ký & Xác thực License Hệ thống ──

Trước khi hệ thống Backend có thể phục vụ bất kỳ người dùng nào, máy chủ của bạn cần được đăng ký và kích hoạt license hợp lệ từ AuthService.

#### Bước 1.1: Gửi yêu cầu đăng ký License
* **Client gọi lên Backend của bạn:**
  * **Method:** `POST`
  * **Endpoint:** `/api/auth/license/register`
  * **Payload (Body):**
    ```json
    {
      "label": "App HKB Register License",
      "expired_at": "2026-12-31 23:59:59",
      "notes": "Đăng ký license môi trường Production"
    }
    ```
* **Luồng xử lý của Backend (Tự động):**
  1. Đọc tệp tin cấu hình trong thư mục cục bộ `.licensekek/license.*.config`.
  2. Sắp xếp các khóa Alphabetical (tương đương `ksort` trong PHP) và chuẩn hóa JSON (tương đương `JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`).
  3. Hash chuỗi theo chuẩn SHA-256 để tạo ra mã `license_seed` đặc độc bản.
  4. Bọc các dữ liệu và gọi API remote của AuthService: `POST /api/license/register`.
  5. Khi AuthService trả về kết quả đăng ký thành công, Backend tự động lưu thông tin license vào Database local (bảng `auth_licenses`) với trạng thái mặc định là **`status = 0`** (Chờ phê duyệt).
  6. Ghi chép lịch sử vào bảng audit log `auth_license_audits`.

---

#### Bước 1.2: Xác thực License (Sau khi được Admin phê duyệt)
Sau khi liên hệ Admin và được duyệt license trên AuthService console, bạn tiến hành xác thực để kích hoạt sử dụng.

* **Client gọi lên Backend của bạn:**
  * **Method:** `POST`
  * **Endpoint:** `/api/auth/license/verify`
  * **Payload (Body):**
    ```json
    {
      "license_key": "MÃ_JWT_LICENSE_ĐƯỢC_CẤP"
    }
    ```
* **Luồng xử lý của Backend (Tự động):**
  1. Kiểm tra sự tồn tại của license trong database cục bộ.
  2. Tạo mã `nonce` ngẫu nhiên và `timestamp` hiện tại.
  3. Tạo chữ ký số từ license key và gửi yêu cầu xác thực remote tới: `POST /api/license/verify`.
  4. Nếu AuthService xác thực hợp lệ, Backend cập nhật trạng thái license cục bộ thành **`status = 1`** (Đang hoạt động) và cập nhật thời gian kích hoạt (`verified_at`).
  5. Ghi log sự kiện `LICENSE_VERIFY` vào audit log.

---

### ── Luồng 2: Lấy cấu hình kết nối & Liên kết User ──

Sau khi License đã được kích hoạt (`status = 1`), bạn bắt đầu thực hiện liên kết từng người dùng của hệ thống với AuthService.

#### Bước 2.1: Lấy thông tin Connections
* **Client gọi lên Backend của bạn:**
  * **Method:** `GET`
  * **Endpoint:** `/api/auth/system-connections/get?group_key=YOUR_GROUP_KEY`
* **Luồng xử lý của Backend (Tự động):**
  1. Gọi API của AuthService lấy thông tin các hệ thống đối tác khả dụng được phép liên kết theo nhóm khóa `group_key`.
* **Response trả về cho Client:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 12,
        "name": "HKB System Connection",
        "target_system_id": "ad561c3b-a6c8-40c0-b6e0-946cdb704fd2"
      }
    ]
  }
  ```

---

#### Bước 2.2: Đăng ký liên kết tài khoản từng User
* **Client gọi lên Backend của bạn:**
  * **Method:** `POST`
  * **Endpoint:** `/api/auth/client-registers`
  * **Payload (Body):**
    ```json
    {
      "system_connection_id": "12", // Lấy từ bước 2.1
      "target_system_id": "ad561c3b-a6c8-40c0-b6e0-946cdb704fd2", // Lấy từ bước 2.1
      "external_id": 99012, // ID của user này trên hệ thống của bạn
      "description": "Liên kết tài khoản Nguyễn Văn A với hệ thống đối tác HKB"
    }
    ```
* **Luồng xử lý của Backend (Tự động):**
  1. Kiểm tra điều kiện tiên quyết: License cục bộ phải còn hạn và đang hoạt động (`status = 1`). Nếu không thỏa mãn, trả về lỗi `LICENSE_NOT_ACTIVE` ngay lập tức mà không gọi lên AuthService.
  2. Bọc thêm thông tin định danh `source_system_id` và chữ ký mã hóa từ cấu hình license.
  3. Thực hiện gọi API của AuthService: `POST /api/client-registers`.
  4. Ghi chép lịch sử `CLIENT_REGISTER` vào audit log local.
* **Response trả về cho Client:**
  ```json
  {
    "success": true,
    "data": {
      "api_key": "client_api_key_xxx...", // Khoá bảo mật dùng để xin cấp token đăng nhập sau này
      "external_id": 99012,
      "status": "success"
    }
  }
  ```

---

### ── Luồng 3: Xác thực đăng nhập & Cấp phát Token ──

#### Bước 3.1: Xin cấp Token từ AuthService
Dùng để cấp Token phục vụ cho việc gọi các dịch vụ được phân quyền qua AuthService.

* **Client gọi lên Backend của bạn:**
  * **Method:** `POST`
  * **Endpoint:** `/api/auth/authenticate`
  * **Payload (Body):**
    ```json
    {
      "api_key": "client_api_key_xxx...", // Lấy ở bước 2.2
      "user_id": "99012" // ID của user trên hệ thống của bạn
    }
    ```
* **Luồng xử lý của Backend (Tự động):**
  1. Chạy qua `replayGuard` kiểm tra tính hợp lệ của timestamp và chống trùng lặp nonce.
  2. Chạy qua `licenseGuard` kiểm tra thời hạn license cục bộ.
  3. Gửi payload xin cấp token tới AuthService: `POST /api/authenticate`.
* **Response trả về cho Client:**
  ```json
  {
    "success": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsIn...", // JWT Token dùng để đính kèm vào Header của Client khi tương tác
      "expires_at": "2026-07-15T17:28:40.000Z"
    }
  }
  ```

---

#### Bước 3.2: Xác thực Token (Dành cho nội bộ Backend của bạn)
Khi Client gọi một API dịch vụ bảo mật của bạn kèm theo header `Authorization: Bearer <token>`, Backend cần gọi verify token để xác minh quyền hạn từ AuthService.

* **Cách tích hợp tại Backend của bạn:**
  ```typescript
  import { AuthServiceClient } from '@TranLamHuyB2017044/bittech-auth-service';
  
  const authClient = new AuthServiceClient({ ... });
  
  // Middleware xác thực bảo mật tài nguyên cục bộ
  async function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Yêu cầu Bearer Token.' });
    }
  
    const token = authHeader.substring(7);
  
    try {
      // 1. Tự động đóng gói chữ ký hệ thống của bạn và gửi request lên AuthService
      const result = await authClient.verifyToken(token);
      
      // 2. Lưu thông tin quyền hạn của User nhận về vào context request
      req.authContext = result.data; 
      next();
    } catch (err) {
      res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
  }
  ```

---

## 4. Các cơ chế bảo mật hoạt động ngầm (Under the hood)

* **Envelope Encryption (Mã hóa phong bì):** 
  Mọi thông tin cấu hình nhạy cảm (`key`, `values`) của hệ thống khi lưu trữ đều được mã hóa bằng thuật toán `AES-256-GCM` qua khóa DEK ngẫu nhiên. Khoá DEK này sau đó tiếp tục được mã hóa bằng khoá KEK (Key Encryption Key) từ AuthService và lưu vào trường `dek_encrypted`.
  
* **Chống Replay Attack:** 
  Các API thay đổi trạng thái đều bắt buộc kiểm tra `timestamp` (không lệch quá 300 giây so với giờ hệ thống máy chủ) và ghi vết `nonce` trong bộ nhớ cache tạm thời để loại bỏ triệt để việc gửi trùng lặp gói tin (Replay Attack).
