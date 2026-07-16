import crypto from 'node:crypto';
import { getPrismaClient } from '../init.js';

export interface AuthLicenseInput {
  public_id: string;
  license_key: string;
  signature?: string | null;
  signature_version?: number;
  device_id?: string | null;
  status?: number;
  expired_at?: Date | null;
  notes?: string | null;
}

export class AuthLicenseRepository {
  private prisma: any;

  constructor(prisma?: any) {
    this.prisma = prisma || getPrismaClient();
  }

  async findByLicenseKey(licenseKey: string) {
    return this.prisma.authLicense.findUnique({
      where: { license_key: licenseKey }
    });
  }

  async findByPublicId(publicId: string) {
    return this.prisma.authLicense.findUnique({
      where: { public_id: publicId }
    });
  }

  async findActiveLicense() {
    return this.prisma.authLicense.findFirst({
      where: { status: 1 }
    });
  }

  async createOrUpdatePendingLicense(data: AuthLicenseInput) {
    const id = crypto.randomUUID();
    return this.prisma.authLicense.upsert({
      where: { license_key: data.license_key },
      update: {
        public_id: data.public_id,
        signature: data.signature ?? null,
        signature_version: data.signature_version ?? 1,
        device_id: data.device_id ?? null,
        status: data.status ?? 0,
        expired_at: data.expired_at ?? null,
        notes: data.notes ?? null
      },
      create: {
        id,
        public_id: data.public_id,
        license_key: data.license_key,
        signature: data.signature ?? null,
        signature_version: data.signature_version ?? 1,
        device_id: data.device_id ?? null,
        status: data.status ?? 0,
        expired_at: data.expired_at ?? null,
        notes: data.notes ?? null
      }
    });
  }

  async verifyLicense(licenseKey: string, approvedAt?: Date) {
    return this.prisma.authLicense.update({
      where: { license_key: licenseKey },
      data: {
        status: 1,
        verified_at: new Date(),
        approved_at: approvedAt ?? new Date(),
        started_at: new Date()
      }
    });
  }
}
