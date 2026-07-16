import crypto from 'node:crypto';

export interface EncryptionResult {
  content: string;
  iv: string;
  authTag: string;
}

export function encryptData(plainText: string, dek: Buffer): EncryptionResult {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return {
    content: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag
  };
}

export function decryptData(encryptedHex: string, dek: Buffer, ivHex: string, authTagHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function generateRandomKey(bytes = 32): Buffer {
  return crypto.randomBytes(bytes);
}
