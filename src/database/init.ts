import { PrismaClient } from './generated-client/index.js';

let internalPrisma: PrismaClient | null = null;

/**
 * Lấy hoặc khởi tạo instance Prisma Client nội bộ của package.
 * @param databaseUrl Chuỗi kết nối database (nếu trống sẽ lấy từ process.env.DATABASE_URL)
 */
export function getPrismaClient(databaseUrl?: string): PrismaClient {
  if (internalPrisma) return internalPrisma;

  const url = databaseUrl || process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      '[bittech-auth-service] Thiếu thông tin chuỗi kết nối Database. Vui lòng truyền databaseUrl khi khởi tạo hoặc thiết lập biến môi trường DATABASE_URL.'
    );
  }

  internalPrisma = new PrismaClient({
    datasources: {
      db: {
        url
      }
    }
  });

  return internalPrisma;
}

/**
 * Tự động kiểm tra và tối ưu hóa index MongoDB cho AuthService và AuthLicense.
 * @param databaseUrl Cấu hình kết nối DB tùy chọn
 */
export async function initializeDatabase(databaseUrl?: string) {
  console.log('[bittech-auth-service] Đang khởi tạo và kiểm tra cấu trúc cơ sở dữ liệu MongoDB...');
  
  const prisma = getPrismaClient(databaseUrl);

  try {
    // MongoDB sẽ tự tạo các collection khi có dữ liệu mới.
    // Chúng ta chạy lệnh tạo Index để đảm bảo các trường public_id, license_key và key là Unique.
    if (prisma.$runCommandRaw) {
      await prisma.$runCommandRaw({
        createIndexes: 'auth_licenses',
        indexes: [
          { key: { public_id: 1 }, name: 'public_id_idx', unique: true },
          { key: { license_key: 1 }, name: 'license_key_idx', unique: true }
        ]
      });
      await prisma.$runCommandRaw({
        createIndexes: 'auth_services',
        indexes: [
          { key: { key: 1 }, name: 'key_idx', unique: true }
        ]
      });
      console.log('[bittech-auth-service] Đã xác thực cấu hình Unique Index thành công trên MongoDB.');
    }
  } catch (err: any) {
    if (err.codeName !== 'IndexAlreadyExists' && !err.message?.includes('IndexAlreadyExists')) {
      console.warn('[bittech-auth-service] Cấu hình index MongoDB:', err.message);
    } else {
      console.log('[bittech-auth-service] Các chỉ mục Index độc bản đã tồn tại và sẵn sàng.');
    }
  }
}
