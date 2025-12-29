/**
 * Schema Transformer: v1 ↔ v2
 * 
 * Transforms payment schemas between v1 and v2 protocol formats
 */

import type {
  PaymentRequirementsV1,
  PaymentRequiredResponseV1,
  PaymentPayloadV1,
  SettlementResponseV1
} from '../types/v1';

import type {
  PaymentRequirements,
  PaymentRequiredResponse,
  PaymentPayload,
  SettlementResponse,
  ResourceInfo
} from '../types/v2';

import { networkV1ToV2, networkV2ToV1 } from './network-mapper';

/**
 * Transform v1 PaymentRequirements to v2
 */
export function upgradePaymentRequirements(v1: PaymentRequirementsV1): PaymentRequirements {
  return {
    scheme: v1.scheme,
    network: networkV1ToV2(v1.network),
    amount: v1.maxAmountRequired,
    asset: v1.asset,
    payTo: v1.payTo,
    maxTimeoutSeconds: v1.maxTimeoutSeconds,
    extra: v1.extra || undefined,
  };
}

/**
 * Transform v2 PaymentRequirements to v1
 */
export function downgradePaymentRequirements(
  v2: PaymentRequirements,
  resource: ResourceInfo
): PaymentRequirementsV1 {
  return {
    scheme: v2.scheme,
    network: networkV2ToV1(v2.network),
    maxAmountRequired: v2.amount,
    resource: resource.url,
    description: resource.description || '',
    mimeType: resource.mimeType || 'application/json',
    outputSchema: null,
    payTo: v2.payTo,
    maxTimeoutSeconds: v2.maxTimeoutSeconds,
    asset: v2.asset,
    extra: v2.extra || null,
  };
}

/**
 * Transform v1 PaymentRequiredResponse to v2
 */
export function upgradePaymentRequiredResponse(
  v1: PaymentRequiredResponseV1
): PaymentRequiredResponse {
  // Extract resource info from first accept (v1 has same resource for all accepts)
  const firstAccept = v1.accepts[0];
  const resource: ResourceInfo = {
    url: firstAccept.resource,
    description: firstAccept.description || undefined,
    mimeType: firstAccept.mimeType || undefined,
  };

  return {
    x402Version: 2,
    error: v1.error || undefined,
    resource,
    accepts: v1.accepts.map(upgradePaymentRequirements),
    extensions: undefined,
  };
}

/**
 * Transform v2 PaymentRequiredResponse to v1
 */
export function downgradePaymentRequiredResponse(
  v2: PaymentRequiredResponse
): PaymentRequiredResponseV1 {
  return {
    x402Version: 1,
    error: v2.error || 'Payment required',
    accepts: v2.accepts.map(req => downgradePaymentRequirements(req, v2.resource)),
  };
}

/**
 * Transform v1 PaymentPayload to v2
 * 
 * Note: v2 requires 'accepted' field which contains full PaymentRequirements.
 * Since v1 payload doesn't have this, we need to provide it from context.
 */
export function upgradePaymentPayload(
  v1: PaymentPayloadV1,
  acceptedRequirements: PaymentRequirements,
  resource?: ResourceInfo
): PaymentPayload {
  return {
    x402Version: 2,
    resource,
    accepted: acceptedRequirements,
    payload: v1.payload,
    extensions: undefined,
  };
}

/**
 * Transform v2 PaymentPayload to v1
 */
export function downgradePaymentPayload(v2: PaymentPayload): PaymentPayloadV1 {
  return {
    x402Version: 1,
    scheme: v2.accepted.scheme,
    network: networkV2ToV1(v2.accepted.network),
    payload: v2.payload,
  };
}

/**
 * Transform v1 SettlementResponse to v2
 */
export function upgradeSettlementResponse(v1: SettlementResponseV1): SettlementResponse {
  return {
    success: v1.success,
    errorReason: v1.errorReason,
    transaction: v1.transaction,
    network: networkV1ToV2(v1.network),
    payer: v1.payer || undefined,
  };
}

/**
 * Transform v2 SettlementResponse to v1
 */
export function downgradeSettlementResponse(v2: SettlementResponse): SettlementResponseV1 {
  return {
    success: v2.success,
    errorReason: v2.errorReason,
    transaction: v2.transaction,
    network: networkV2ToV1(v2.network),
    payer: v2.payer || '', // v1 requires payer, use empty string if not available
  };
}

/**
 * Generic schema transformer that auto-detects direction
 */
export class SchemaTransformer {
  /**
   * Transform PaymentRequiredResponse between versions
   */
  static transformPaymentRequired(
    payload: PaymentRequiredResponseV1 | PaymentRequiredResponse,
    targetVersion: 1 | 2
  ): PaymentRequiredResponseV1 | PaymentRequiredResponse {
    const sourceVersion = payload.x402Version as 1 | 2;

    if (sourceVersion === targetVersion) {
      return payload;
    }

    if (targetVersion === 2) {
      return upgradePaymentRequiredResponse(payload as PaymentRequiredResponseV1);
    } else {
      return downgradePaymentRequiredResponse(payload as PaymentRequiredResponse);
    }
  }

  /**
   * Transform PaymentPayload between versions
   * 
   * Note: Upgrading v1→v2 requires additional context (acceptedRequirements)
   */
  static transformPaymentPayload(
    payload: PaymentPayloadV1 | PaymentPayload,
    targetVersion: 1 | 2,
    context?: {
      acceptedRequirements?: PaymentRequirements;
      resource?: ResourceInfo;
    }
  ): PaymentPayloadV1 | PaymentPayload {
    const sourceVersion = payload.x402Version as 1 | 2;

    if (sourceVersion === targetVersion) {
      return payload;
    }

    if (targetVersion === 2) {
      if (!context?.acceptedRequirements) {
        throw new Error(
          'Cannot upgrade v1 PaymentPayload to v2 without acceptedRequirements context'
        );
      }
      return upgradePaymentPayload(
        payload as PaymentPayloadV1,
        context.acceptedRequirements,
        context.resource
      );
    } else {
      return downgradePaymentPayload(payload as PaymentPayload);
    }
  }

  /**
   * Transform SettlementResponse between versions
   */
  static transformSettlementResponse(
    response: SettlementResponseV1 | SettlementResponse,
    targetVersion: 1 | 2
  ): SettlementResponseV1 | SettlementResponse {
    // Check if already target version
    const hasV2Network = 'network' in response && typeof response.network === 'string' && response.network.includes(':');
    const isV2 = hasV2Network || ('payer' in response && response.payer === undefined);
    const sourceVersion: 1 | 2 = isV2 ? 2 : 1;

    if (sourceVersion === targetVersion) {
      return response;
    }

    if (targetVersion === 2) {
      return upgradeSettlementResponse(response as SettlementResponseV1);
    } else {
      return downgradeSettlementResponse(response as SettlementResponse);
    }
  }
}
