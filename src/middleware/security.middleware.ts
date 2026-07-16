import type { Request, Response, NextFunction } from 'express';

// ─── In-memory Nonce Cache ───────────────────────────────────────────────────
const nonceCache = new Map<string, number>();

// Dọn dẹp nonce cũ sau mỗi 1 phút để tránh rò rỉ bộ nhớ
setInterval(() => {
  const now = Date.now() / 1000;
  for (const [nonce, ts] of nonceCache.entries()) {
    if (now - ts > 300) nonceCache.delete(nonce);
  }
}, 60_000).unref();

// ─── 1. Replay Attack Guard ──────────────────────────────────────────────────
/**
 * Middleware kiểm tra chống Replay Attack.
 * Yêu cầu request body hoặc query có trường `nonce` và `timestamp`.
 * - timestamp không được lệch quá 5 phút so với server time.
 * - nonce chỉ được dùng một lần trong vòng 5 phút.
 */
export function validateReplayAttack(req: Request, res: Response, next: NextFunction): void {
  const nonce: string = req.body?.nonce || req.query?.nonce;
  const timestamp: string = req.body?.timestamp || req.query?.timestamp;

  if (!nonce || !timestamp) {
    res.status(400).json({
      success: false,
      code: 'MISSING_REPLAY_FIELDS',
      message: 'Thiếu trường nonce hoặc timestamp để xác thực chống replay attack.'
    });
    return;
  }

  const now = Date.now() / 1000;
  const requestTime = Number(timestamp);

  if (isNaN(requestTime)) {
    res.status(400).json({
      success: false,
      code: 'INVALID_TIMESTAMP',
      message: 'Định dạng timestamp không hợp lệ. Cần số Unix epoch.'
    });
    return;
  }

  if (Math.abs(now - requestTime) > 300) {
    res.status(401).json({
      success: false,
      code: 'TIMESTAMP_EXPIRED',
      message: 'Yêu cầu đã hết hạn. Timestamp lệch quá 5 phút so với server.'
    });
    return;
  }

  if (nonceCache.has(nonce)) {
    res.status(401).json({
      success: false,
      code: 'DUPLICATE_NONCE',
      message: 'Phát hiện request trùng lặp. Nonce đã được sử dụng trước đó.'
    });
    return;
  }

  nonceCache.set(nonce, requestTime);
  next();
}

import { getPrismaClient } from '../database/init.js';

// ─── 2. License Status Guard ─────────────────────────────────────────────────
/**
 * Factory tạo middleware kiểm tra xem license local đã được xác thực (status = 1) chưa.
 * Truyền vào `prisma` client từ ứng dụng đích (hoặc bỏ trống để dùng Prisma Client nội bộ của package).
 * Dùng để bảo vệ các route yêu cầu license đang hoạt động (authenticate, client-registers, kek/request).
 *
 * @example
 * router.post('/authenticate', requireActiveLicense(prisma), handler)
 */
export function requireActiveLicense(prisma?: any) {
  return async function licenseGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = prisma || getPrismaClient();
      const activeLicense = await db.authLicense.findFirst({
        where: { status: 1 },
        select: { license_key: true, expired_at: true, verified_at: true }
      });

      if (!activeLicense) {
        res.status(403).json({
          success: false,
          code: 'LICENSE_NOT_ACTIVE',
          message: 'License chưa được kích hoạt. Vui lòng đăng ký và xác thực license trước.'
        });
        return;
      }

      // Kiểm tra license có hết hạn chưa
      if (activeLicense.expired_at && new Date(activeLicense.expired_at) < new Date()) {
        res.status(403).json({
          success: false,
          code: 'LICENSE_EXPIRED',
          message: `License đã hết hạn vào ${activeLicense.expired_at}. Vui lòng gia hạn license.`
        });
        return;
      }

      // Đính kèm thông tin license vào request để các handler sau có thể dùng
      (req as any).activeLicense = activeLicense;
      next();
    } catch (err: any) {
      res.status(500).json({
        success: false,
        code: 'LICENSE_CHECK_ERROR',
        message: 'Không thể kiểm tra trạng thái license. Vui lòng kiểm tra kết nối database.',
        detail: process.env['NODE_ENV'] === 'development' ? err.message : undefined
      });
    }
  };
}

// ─── 3. Default Error Handler ─────────────────────────────────────────────────
/**
 * Express error-handling middleware mặc định của package bittech-auth-service.
 * Mount sau tất cả các route của package để bắt lỗi chưa được xử lý.
 *
 * @example
 * app.use('/api/auth', createAuthRouter(client, prisma));
 * app.use(authServiceErrorHandler); // Mount sau router
 */
export function authServiceErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isDev = process.env['NODE_ENV'] === 'development';

  // Lỗi từ Axios (gọi AuthService remote thất bại)
  if (err?.isAxiosError || err?.response) {
    const status = err.response?.status ?? 502;
    const remoteMessage = err.response?.data?.message || err.response?.data?.error || err.message;

    res.status(status).json({
      success: false,
      code: 'AUTH_SERVICE_ERROR',
      message: `Lỗi từ AuthService: ${remoteMessage}`,
      detail: isDev ? { url: err.config?.url, status } : undefined
    });
    return;
  }

  // Lỗi Prisma (database)
  if (err?.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    const prismaMessages: Record<string, string> = {
      P2002: 'Dữ liệu đã tồn tại (vi phạm ràng buộc unique).',
      P2025: 'Không tìm thấy bản ghi để cập nhật.',
      P2003: 'Vi phạm ràng buộc khóa ngoại.',
    };
    res.status(409).json({
      success: false,
      code: `DB_${err.code}`,
      message: prismaMessages[err.code] ?? `Lỗi database: ${err.code}`,
      detail: isDev ? err.meta : undefined
    });
    return;
  }

  // Lỗi đọc file license config
  if (err?.message?.includes('License config file not found')) {
    res.status(500).json({
      success: false,
      code: 'LICENSE_CONFIG_NOT_FOUND',
      message: err.message
    });
    return;
  }

  // Lỗi JSON parsing config
  if (err?.message?.includes('Failed to parse license JSON')) {
    res.status(500).json({
      success: false,
      code: 'LICENSE_CONFIG_INVALID',
      message: err.message
    });
    return;
  }

  // Lỗi chung
  const status = err?.statusCode ?? err?.status ?? 500;
  res.status(status).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: err?.message ?? 'Lỗi không xác định từ bittech-auth-service.',
    detail: isDev ? err?.stack : undefined
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────────
export { nonceCache };
