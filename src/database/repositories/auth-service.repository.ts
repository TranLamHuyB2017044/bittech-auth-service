import crypto from 'node:crypto';
import { encryptData, decryptData } from '../../utils/crypto.js';
import { getPrismaClient } from '../init.js';

export interface AuthServiceInput {
  uuid?: string | null;
  endpoint?: string | null;
  connection_type?: string | null;
  key: string;
  values: string;
  user_id?: string | null;
  app_name?: string | null;
  app_info?: string | null;
  kek_version?: number;
}

export class AuthServiceRepository {
  private prisma: any;

  constructor(private kek: Buffer, prisma?: any) {
    this.prisma = prisma || getPrismaClient();
  }

  async findByKey(key: string) {
    const service = await this.prisma.authService.findUnique({
      where: { key }
    });
    if (!service) return null;
    return this.decryptFields(service);
  }

  async saveService(data: AuthServiceInput) {
    // Sinh khóa DEK ngẫu nhiên
    const dek = crypto.randomBytes(32);
    
    // Mã hóa DEK bằng KEK sử dụng AES-256-CBC với IV bằng 0 (vì DEK là chuỗi ngẫu nhiên có độ hỗn loạn cao)
    const ivDek = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.kek, ivDek);
    let dekEncrypted = cipher.update(dek).toString('hex');
    dekEncrypted += cipher.final().toString('hex');

    // Mã hóa key và values bằng DEK sử dụng AES-256-GCM
    const encryptedKey = encryptData(data.key, dek);
    const encryptedValues = encryptData(data.values, dek);

    const id = crypto.randomUUID();
    
    return this.prisma.authService.upsert({
      where: { key: data.key },
      update: {
        uuid: data.uuid ?? null,
        endpoint: data.endpoint ?? null,
        connection_type: data.connection_type ?? null,
        key_encrypted: encryptedKey.content,
        values: encryptedValues.content,
        values_encrypted: encryptedValues.content,
        user_id: data.user_id ?? null,
        app_name: data.app_name ?? null,
        app_info: data.app_info ?? null,
        dek_encrypted: dekEncrypted,
        data_iv: `${encryptedValues.iv}:${encryptedValues.authTag}:${encryptedKey.iv}:${encryptedKey.authTag}`,
        kek_version: data.kek_version ?? 1
      },
      create: {
        id,
        uuid: data.uuid ?? null,
        endpoint: data.endpoint ?? null,
        connection_type: data.connection_type ?? null,
        key: data.key,
        key_encrypted: encryptedKey.content,
        values: encryptedValues.content,
        values_encrypted: encryptedValues.content,
        user_id: data.user_id ?? null,
        app_name: data.app_name ?? null,
        app_info: data.app_info ?? null,
        dek_encrypted: dekEncrypted,
        data_iv: `${encryptedValues.iv}:${encryptedValues.authTag}:${encryptedKey.iv}:${encryptedKey.authTag}`,
        kek_version: data.kek_version ?? 1
      }
    });
  }

  private decryptFields(service: any) {
    if (!service.dek_encrypted || !service.data_iv) {
      return service;
    }

    try {
      // Giải mã DEK bằng KEK
      const ivDek = Buffer.alloc(16, 0);
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.kek, ivDek);
      let dekHex = decipher.update(Buffer.from(service.dek_encrypted, 'hex')).toString('hex');
      dekHex += decipher.final().toString('hex');
      const dek = Buffer.from(dekHex, 'hex');

      // Unpack IVs và AuthTags
      const [valuesIv, valuesTag, keyIv, keyTag] = service.data_iv.split(':');

      const decryptedKey = service.key_encrypted
        ? decryptData(service.key_encrypted, dek, keyIv, keyTag)
        : service.key;

      const decryptedValues = service.values_encrypted
        ? decryptData(service.values_encrypted, dek, valuesIv, valuesTag)
        : service.values;

      return {
        ...service,
        key: decryptedKey,
        values: decryptedValues
      };
    } catch (err: any) {
      console.error('[bittech-auth-service] Lỗi giải mã các trường auth service:', err.message);
      return service;
    }
  }
}
