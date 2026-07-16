import axios from 'axios';
import crypto from 'node:crypto';
import { calculateLicenseSeed, LicenseConfig } from '../helpers/license.helper.js';

export interface AuthClientConfig {
  authApiUrl: string;
  systemId: string;
  licenseDir?: string;
  licenseFilename?: string;
}

export class AuthServiceClient {
  private authApiUrl: string;
  private systemId: string;
  private licenseDir: string;
  private licenseFilename: string;

  constructor(config: AuthClientConfig) {
    this.authApiUrl = config.authApiUrl;
    this.systemId = config.systemId;
    this.licenseDir = config.licenseDir || '.licensekek';
    this.licenseFilename = config.licenseFilename || 'license.he-thong-log-log-system.config';
  }

  private getLicenseSeedAndConfig() {
    return calculateLicenseSeed(this.licenseDir, this.licenseFilename);
  }

  private createRequestMetadata() {
    const { config } = this.getLicenseSeedAndConfig();
    return {
      nonce: crypto.randomBytes(16).toString('hex'),
      timestamp: String(Math.floor(Date.now() / 1000)),
      signature: config.signature
    };
  }

  // 1. Đăng ký license
  async registerLicense(label: string, expiredAt: string, notes?: string) {
    const { seed } = this.getLicenseSeedAndConfig();
    
    const fs = await import('node:fs');
    const path = await import('node:path');
    const configPath = path.join(process.cwd(), this.licenseDir, this.licenseFilename);
    const licenseConfigContent = fs.readFileSync(configPath, 'utf8');

    const payload = {
      system_connection_id: 12,
      license_config: licenseConfigContent,
      license_seed: seed,
      label,
      expired_at: expiredAt,
      notes: notes || ''
    };

    const response = await axios.post(`${this.authApiUrl}/api/license/register`, payload, {
      headers: { Accept: 'application/json' }
    });
    return response.data;
  }

  // 2. Xác thực license
  async verifyLicense(licenseKey: string) {
    const { seed } = this.getLicenseSeedAndConfig();
    const { nonce, timestamp, signature } = this.createRequestMetadata();

    const payload = {
      license_key: licenseKey,
      license_seed: seed,
      system_id: this.systemId,
      nonce,
      timestamp,
      signature
    };

    const response = await axios.post(`${this.authApiUrl}/api/license/verify`, payload, {
      headers: { Accept: 'application/json' }
    });
    return response.data;
  }

  // 3. Lấy thông tin connection
  async getSystemConnections(groupKeys: string[], clientRegister: any[] = []) {
    const { config } = this.getLicenseSeedAndConfig();
    const { nonce, timestamp, signature } = this.createRequestMetadata();

    const payload = {
      source_system_id: this.systemId,
      group_key: groupKeys,
      client_register: clientRegister,
      license_key: config.signature,
      nonce,
      timestamp,
      signature
    };

    const response = await axios.get(`${this.authApiUrl}/api/system-connections/get`, {
      data: payload,
      headers: { Accept: 'application/json' }
    });
    return response.data;
  }

  // 4. Đăng ký liên kết tài khoản
  async registerClient(connectionId: string, targetSystemId: string, externalId: any, description: string) {
    const { seed, config } = this.getLicenseSeedAndConfig();
    const { nonce, timestamp, signature } = this.createRequestMetadata();

    const payload = {
      system_connection_id: connectionId,
      target_system_id: targetSystemId,
      source_system_id: this.systemId,
      external_id: externalId,
      description,
      license_key: config.signature,
      license_seed: seed,
      nonce,
      timestamp,
      signature
    };

    const response = await axios.post(`${this.authApiUrl}/api/client-registers`, payload, {
      headers: { Accept: 'application/json' }
    });
    return response.data;
  }

  // 5. Xin cấp token
  async authenticate(apiKey: string, userId: string) {
    const { config } = this.getLicenseSeedAndConfig();
    const { nonce, timestamp, signature } = this.createRequestMetadata();

    const payload = {
      source_system_id: this.systemId,
      license_key: config.signature,
      api_key: apiKey,
      user_id: userId,
      nonce,
      timestamp,
      signature
    };

    const response = await axios.post(`${this.authApiUrl}/api/authenticate`, payload, {
      headers: { Accept: 'application/json' }
    });
    return response.data;
  }

  // 6. Verify Token (Backend)
  async verifyToken(token: string) {
    const { config } = this.getLicenseSeedAndConfig();
    const { nonce, timestamp, signature } = this.createRequestMetadata();

    const payload = {
      source_system_id: this.systemId,
      license_key: config.signature,
      api_key: '',
      user_id: '',
      nonce,
      timestamp,
      signature
    };

    const response = await axios.post(`${this.authApiUrl}/api/verify-token`, payload, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  }

  // 7. Request KEK
  async requestKek() {
    const { seed, config } = this.getLicenseSeedAndConfig();
    const { nonce, timestamp, signature } = this.createRequestMetadata();

    const payload = {
      license_key: config.signature,
      license_seed: seed,
      system_id: this.systemId,
      nonce,
      timestamp,
      signature
    };

    const response = await axios.post(`${this.authApiUrl}/api/kek/request`, payload, {
      headers: { Accept: 'application/json' }
    });
    return response.data;
  }
}
