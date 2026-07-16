import fs from 'node:fs';
import path from 'node:path';
import { canonicalJsonStringify } from '../utils/key-sorter.js';
import { sha256 } from '../utils/hash.js';

export interface LicenseConfig {
  project_id: string;
  system_id: string;
  public_key: string;
  base_url: string;
  device_id: string;
  signature: string;
  [key: string]: any;
}

export function loadLicenseConfig(licenseDir: string, licenseFilename: string): LicenseConfig {
  const filePath = path.join(process.cwd(), licenseDir, licenseFilename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[bittech-auth-service] License config file not found at: ${filePath}`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(rawContent) as LicenseConfig;
  } catch (err: any) {
    throw new Error(`[bittech-auth-service] Failed to parse license JSON: ${err.message}`);
  }
}

export function calculateLicenseSeed(licenseDir: string, licenseFilename: string): { seed: string; filename: string; config: LicenseConfig } {
  const config = loadLicenseConfig(licenseDir, licenseFilename);
  const canonicalContent = canonicalJsonStringify(config);
  
  // Hash sha256: hash('sha256', filename . '|' . canonicalContent)
  const contentToHash = `${licenseFilename}|${canonicalContent}`;
  const seed = sha256(contentToHash);

  return {
    seed,
    filename: licenseFilename,
    config
  };
}
