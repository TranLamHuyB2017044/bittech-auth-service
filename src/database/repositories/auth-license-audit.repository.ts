import crypto from 'node:crypto';
import { getPrismaClient } from '../init.js';

export interface AuditLogInput {
  action: string;
  auditable_type?: string | null;
  auditable_id?: string | null;
  causer_type?: string | null;
  causer_id?: string | null;
  properties?: any;
  ip_address?: string | null;
  user_agent?: string | null;
}

export class AuthLicenseAuditRepository {
  private prisma: any;

  constructor(prisma?: any) {
    this.prisma = prisma || getPrismaClient();
  }

  async logAudit(data: AuditLogInput) {
    const id = crypto.randomUUID();
    
    // Đảm bảo properties được lưu trữ ở dạng chuỗi JSON hoặc JSON object tùy theo DB
    const provider = this.prisma._activeProvider || 'mongodb';
    let propertiesData = data.properties ?? null;
    
    if (provider !== 'mongodb' && propertiesData !== null) {
      if (typeof propertiesData !== 'string') {
        propertiesData = JSON.stringify(propertiesData);
      }
    }

    return this.prisma.authLicenseAudit.create({
      data: {
        id,
        action: data.action,
        auditable_type: data.auditable_type ?? null,
        auditable_id: data.auditable_id ?? null,
        causer_type: data.causer_type ?? null,
        causer_id: data.causer_id ?? null,
        properties: propertiesData,
        ip_address: data.ip_address ?? null,
        user_agent: data.user_agent ?? null
      }
    });
  }
}
