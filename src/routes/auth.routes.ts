import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuthServiceClient } from '../client/auth.client.js';
import { AuthLicenseRepository } from '../database/repositories/auth-license.repository.js';
import { AuthLicenseAuditRepository } from '../database/repositories/auth-license-audit.repository.js';
import {
  validateReplayAttack,
  requireActiveLicense,
  authServiceErrorHandler
} from '../middleware/security.middleware.js';

export interface AuthRouterOptions {
  /** Bật kiểm tra chống replay attack (mặc định: true) */
  enableReplayProtection?: boolean;
  /**
   * Bật kiểm tra license đang hoạt động (status = 1, chưa hết hạn) cho các
   * route yêu cầu license active: authenticate, client-registers, kek/request, verify-token.
   * Mặc định: true
   */
  enableLicenseGuard?: boolean;
}

export function createAuthRouter(
  client: AuthServiceClient,
  prisma?: any,
  options: AuthRouterOptions = {}
) {
  const router = Router();
  const licenseRepo = new AuthLicenseRepository(prisma);
  const auditRepo = new AuthLicenseAuditRepository(prisma);
  const enableReplay = options.enableReplayProtection !== false;
  const enableLicenseGuard = options.enableLicenseGuard !== false;

  // ─── Helper: lấy IP và User-Agent ──────────────────────────────────────────
  function getMeta(req: Request) {
    return {
      ip_address:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        null,
      user_agent: req.headers['user-agent'] || null
    };
  }

  // ─── Middleware replay ───────────────────────────────────────────────────────
  const replayGuard = enableReplay
    ? validateReplayAttack
    : (_req: Request, _res: Response, next: NextFunction) => next();

  // ─── Middleware license guard ────────────────────────────────────────────────
  // Chỉ áp dụng cho các route yêu cầu license đang active
  const licenseGuard = enableLicenseGuard
    ? requireActiveLicense(prisma)
    : (_req: Request, _res: Response, next: NextFunction) => next();

  // ───────────────────────────────────────────────────────────────────────────
  //  1. POST /license/register
  //     Đăng ký license → lưu local DB với status = 0 (chờ duyệt)
  // ───────────────────────────────────────────────────────────────────────────
  router.post('/license/register', replayGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { label, expired_at, notes } = req.body;
      if (!label || !expired_at) {
        res.status(400).json({ success: false, message: 'Thiếu trường label hoặc expired_at.' });
        return;
      }

      const result = await client.registerLicense(label, expired_at, notes);
      const data = result?.data ?? result;

      // Lưu license tạm thời với status = 0
      await licenseRepo.createOrUpdatePendingLicense({
        public_id: data.public_id ?? `pending-${Date.now()}`,
        license_key: data.license_key ?? data.token ?? '',
        signature: data.signature ?? null,
        status: 0,
        expired_at: new Date(expired_at),
        notes: notes ?? null
      });

      // Ghi audit log
      const meta = getMeta(req);
      await auditRepo.logAudit({
        action: 'LICENSE_REGISTER',
        auditable_type: 'AuthLicense',
        auditable_id: data.public_id,
        properties: { label, expired_at },
        ...meta
      });

      res.json({ success: true, data, message: 'Đăng ký license thành công. Chờ admin phê duyệt.' });
    } catch (error) {
      next(error);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  2. POST /license/verify
  //     Xác thực license đã được admin duyệt → cập nhật status = 1
  // ───────────────────────────────────────────────────────────────────────────
  router.post('/license/verify', replayGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { license_key } = req.body;
      if (!license_key) {
        res.status(400).json({ success: false, message: 'Thiếu trường license_key.' });
        return;
      }

      const existing = await licenseRepo.findByLicenseKey(license_key);
      if (!existing) {
        res.status(404).json({ success: false, message: 'License không tồn tại trong hệ thống local.' });
        return;
      }

      const result = await client.verifyLicense(license_key);
      const data = result?.data ?? result;

      // Cập nhật status = 1 sau khi xác thực thành công
      await licenseRepo.verifyLicense(license_key, data.approved_at ? new Date(data.approved_at) : new Date());

      // Ghi audit log
      const meta = getMeta(req);
      await auditRepo.logAudit({
        action: 'LICENSE_VERIFY',
        auditable_type: 'AuthLicense',
        auditable_id: existing.public_id,
        properties: { license_key, status: 1 },
        ...meta
      });

      res.json({ success: true, data, message: 'Xác thực license thành công.' });
    } catch (error) {
      next(error);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  3. GET /system-connections/get
  //     Lấy thông tin connection từ AuthService
  // ───────────────────────────────────────────────────────────────────────────
  router.get('/system-connections/get', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawGroupKey = req.query.group_key;
      const groupKeys: string[] = Array.isArray(rawGroupKey)
        ? (rawGroupKey as string[])
        : rawGroupKey
        ? [rawGroupKey as string]
        : [];

      const result = await client.getSystemConnections(groupKeys);
      res.json({ success: true, data: result?.data ?? result });
    } catch (error) {
      next(error);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  4. POST /client-registers
  //     Đăng ký liên kết tài khoản với hệ thống khác
  // ───────────────────────────────────────────────────────────────────────────
  router.post('/client-registers', replayGuard, licenseGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { system_connection_id, target_system_id, external_id, description } = req.body;
      if (!system_connection_id || !target_system_id) {
        res.status(400).json({ success: false, message: 'Thiếu trường system_connection_id hoặc target_system_id.' });
        return;
      }

      const result = await client.registerClient(system_connection_id, target_system_id, external_id, description ?? '');
      const data = result?.data ?? result;

      const meta = getMeta(req);
      await auditRepo.logAudit({
        action: 'CLIENT_REGISTER',
        auditable_type: 'AuthService',
        properties: { system_connection_id, target_system_id, external_id },
        ...meta
      });

      res.json({ success: true, data, message: 'Đăng ký liên kết thành công.' });
    } catch (error) {
      next(error);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  5. POST /authenticate
  //     Xin cấp token từ AuthService
  // ───────────────────────────────────────────────────────────────────────────
  router.post('/authenticate', replayGuard, licenseGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { api_key, user_id } = req.body;
      if (!api_key || !user_id) {
        res.status(400).json({ success: false, message: 'Thiếu trường api_key hoặc user_id.' });
        return;
      }

      const result = await client.authenticate(api_key, String(user_id));
      res.json({ success: true, data: result?.data ?? result });
    } catch (error) {
      next(error);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  6. POST /verify-token
  //     Xác thực token Bearer gửi lên (dùng cho backend)
  //     Authorization: Bearer <token>
  // ───────────────────────────────────────────────────────────────────────────
  router.post('/verify-token', licenseGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

      if (!token) {
        res.status(401).json({ success: false, message: 'Thiếu Bearer token trong header Authorization.' });
        return;
      }

      const result = await client.verifyToken(token);
      res.json({ success: true, data: result?.data ?? result });
    } catch (error) {
      next(error);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  7. POST /kek/request
  //     Yêu cầu cấp KEK từ AuthService
  // ───────────────────────────────────────────────────────────────────────────
  router.post('/kek/request', replayGuard, licenseGuard, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await client.requestKek();
      const data = result?.data ?? result;

      const meta = getMeta(req);
      await auditRepo.logAudit({
        action: 'KEK_REQUEST',
        auditable_type: 'AuthService',
        properties: { kek_version: data?.kek_version },
        ...meta
      });

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  });

  // ─── Default Error Handler cho toàn bộ router này ──────────────────────────
  // authServiceErrorHandler phải được mount SAU các routes để catch lỗi từ next(error)
  router.use(authServiceErrorHandler);

  return router;
}
