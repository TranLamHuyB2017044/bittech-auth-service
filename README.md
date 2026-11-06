# bittech-auth-service

## Cài đặt

Thư viện được lưu trữ trên **GitHub Packages**. 

1. Tạo tệp `.npmrc` ở gốc dự án:
   ```ini
   @tranlamhuyb2017044:registry=https://npm.pkg.github.com/
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

2. Đặt biến môi trường `NODE_AUTH_TOKEN` bằng GitHub personal access token (classic) có scope `read:packages`. Tài khoản cấp token cần có quyền đọc package.

3. Cài đặt package:
   ```bash
   npm install @tranlamhuyb2017044/bittech-auth-service
   ```

*Hoặc cài đặt trực tiếp qua Git SSH:*
```bash
npm install git+ssh://git@github.com:TranLamHuyB2017044/bittech-auth-service.git
```
