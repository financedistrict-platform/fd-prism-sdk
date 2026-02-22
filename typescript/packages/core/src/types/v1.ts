/**
 * x402 Protocol v1 Type Definitions
 * 
 * These types represent the LEGACY v1 protocol structure.
 * New code should use v2 types from ./index.ts
 * 
 * @deprecated Use v2 types instead. v1 support will be removed in v2.0.0
 */

/**
 * v1 Payment Requirements (embedded in accepts array)
 */
export interface PaymentRequirementsV1 {
  /** Payment scheme identifier (e.g., "exact") */
  scheme: string;

  /** Network identifier (e.g., "base-sepolia", "ethereum-mainnet") */
  network: string;

  /** Maximum amount required in atomic units */
  maxAmountRequired: string;

  /** URL of the protected resource */
  resource: string;

  /** Human-readable description */
  description: string;

  /** MIME type of expected response */
  mimeType: string;

  /** JSON schema of response (unused in practice) */
  outputSchema?: object | null;

  /** Recipient wallet address */
  payTo: string;

  /** Maximum timeout in seconds */
  maxTimeoutSeconds: number;

  /** Token contract address */
  asset: string;

  /** Scheme-specific extra data */
  extra: object | null;
}

/**
 * v1 Payment Required Response (402 response body)
 */
export interface PaymentRequiredResponseV1 {
  /** Protocol version (always 1 for v1) */
  x402Version: 1;

  /** Human-readable error message */
  error: string;

  /** Array of accepted payment requirements */
  accepts: PaymentRequirementsV1[];
}

/**
 * v1 Payment Payload (sent in X-PAYMENT header)
 */
export interface PaymentPayloadV1 {
  /** Protocol version (always 1 for v1) */
  x402Version: 1;

  /** Payment scheme identifier */
  scheme: string;

  /** Network identifier */
  network: string;

  /** Scheme-specific payment data */
  payload: {
    /** EIP-712 signature */
    signature: string;

    /** EIP-3009 authorization parameters */
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

/**
 * v1 Settlement Response (sent in X-PAYMENT-RESPONSE header)
 */
export interface SettlementResponseV1 {
  /** Whether settlement was successful */
  success: boolean;

  /** Error reason if settlement failed */
  errorReason?: string;

  /** Blockchain transaction hash */
  transaction: string;

  /** Network identifier */
  network: string;

  /** Payer's wallet address (required in v1) */
  payer: string;
}

/**
 * v1 Verify Request (to facilitator /verify endpoint)
 */
export interface VerifyRequestV1 {
  paymentPayload: PaymentPayloadV1;
  paymentRequirements: PaymentRequirementsV1;
}

/**
 * v1 Verify Response (from facilitator /verify endpoint)
 */
export interface VerifyResponseV1 {
  /** Whether payment authorization is valid */
  isValid: boolean;

  /** Reason for invalidity */
  invalidReason?: string;

  /** Payer's wallet address */
  payer?: string;
}

/**
 * v1 Settle Request (to facilitator /settle endpoint)
 */
export interface SettleRequestV1 {
  paymentPayload: PaymentPayloadV1;
  paymentRequirements: PaymentRequirementsV1;
}

/**
 * v1 HTTP Headers
 */
export const V1_HEADERS = {
  /** Client sends payment payload in this header */
  PAYMENT: 'X-PAYMENT',

  /** Server sends settlement response in this header */
  PAYMENT_RESPONSE: 'X-PAYMENT-RESPONSE',
} as const;
