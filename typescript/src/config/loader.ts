import { PrismStaticConfig } from '../types';

/**
 * Configuration loader for different modes
 */
export class ConfigLoader {
  /**
   * Load configuration from cloud URL
   * PLACEHOLDER: To be implemented in Phase 2
   */
  static async loadFromCloud(url: string): Promise<PrismStaticConfig> {
    // TODO: Implement cloud configuration loading
    // This will fetch the configuration from a cloud-hosted JSON file
    // Example: https://config.prism.1stdigital.tech/payment-config.json

    console.warn('Cloud configuration loading not yet implemented');
    throw new Error('Cloud configuration mode not yet implemented. Use "on-demand" mode instead.');
  }

  /**
   * Load configuration from local file
   * PLACEHOLDER: To be implemented in Phase 2
   */
  static async loadFromFile(filePath: string): Promise<PrismStaticConfig> {
    // TODO: Implement file-based configuration loading
    // This will read a JSON file from the local filesystem
    // The file should match the PrismStaticConfig structure

    console.warn('File configuration loading not yet implemented');
    throw new Error('File configuration mode not yet implemented. Use "on-demand" mode instead.');
  }

  /**
   * Validate static configuration structure
   */
  static validateConfig(config: PrismStaticConfig): boolean {
    if (!config.x402Version || typeof config.x402Version !== 'number') {
      return false;
    }

    if (!config.updatedAt || typeof config.updatedAt !== 'string') {
      return false;
    }

    if (!Array.isArray(config.accepted)) {
      return false;
    }

    // Validate each accepted payment method
    for (const payment of config.accepted) {
      if (
        !payment.scheme ||
        !payment.network ||
        !payment.payTo ||
        !payment.asset ||
        typeof payment.maxTimeoutSeconds !== 'number'
      ) {
        return false;
      }
    }

    return true;
  }
}
