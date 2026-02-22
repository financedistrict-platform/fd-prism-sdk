/**
 * x402 Protocol v2 Type Definitions
 * 
 * These are the CURRENT protocol types (v2 is default).
 * These replace and improve upon v1 types.
 */

/**
 * v2 Resource Information (separated from payment requirements)
 */
export interface ResourceInfo {
  /** URL of the protected resource */
  url: string;

  /** Human-readable description (optional in v2) */
  description?: string;

  /** MIME type of expected response (optional in v2) */
  mimeType?: string;
}

/**
 * v2 Payment Requirements
 */
export interface PaymentRequirements {
  /** Payment scheme identifier (e.g., "exact") */
  scheme: string;

  /** Network identifier in CAIP-2 format (e.g., "eip155:84532") */
  network: string;

  /** Required payment amount in atomic units */
  amount: string;

  /** Token contract address or ISO 4217 currency code */
  asset: string;

  /** Recipient wallet address or role constant */
  payTo: string;

  /** Maximum timeout in seconds */
  maxTimeoutSeconds: number;

  /** Scheme-specific extra data */
  extra?: Record<string, unknown>;
}

/**
 * v2 Payment Required Response (402 response with PAYMENT-REQUIRED header)
 */
export interface PaymentRequiredResponse {
  /** Protocol version (2 for v2) */
  x402Version: 2;

  /** Human-readable error message (optional in v2) */
  error?: string;

  /** Resource information (separated from requirements) */
  resource: ResourceInfo;

  /** Array of accepted payment requirements */
  accepts: PaymentRequirements[];

  /** Protocol extensions (optional) */
  extensions?: Record<string, unknown>;
}

/**
 * v2 Payment Payload (sent in PAYMENT-SIGNATURE header)
 */
export interface PaymentPayload {
  /** Protocol version (2 for v2) */
  x402Version: 2;

  /** Resource information (optional in payload) */
  resource?: ResourceInfo;

  /** The payment requirement that was accepted */
  accepted: PaymentRequirements;

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

  /** Protocol extensions (optional) */
  extensions?: Record<string, unknown>;
}

/**
 * v2 Settlement Response (sent in PAYMENT-RESPONSE header)
 */
export interface SettlementResponse {
  /** Whether settlement was successful */
  success: boolean;

  /** Error reason if settlement failed */
  errorReason?: string;

  /** Blockchain transaction hash */
  transaction: string;

  /** Network identifier in CAIP-2 format */
  network: string;

  /** Payer's wallet address (optional in v2) */
  payer?: string;
}

/**
 * v2 Verify Request (to facilitator /verify endpoint)
 */
export interface VerifyRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * v2 Verify Response (from facilitator /verify endpoint)
 */
export interface VerifyResponse {
  /** Whether payment authorization is valid */
  isValid: boolean;

  /** Reason for invalidity */
  invalidReason?: string;

  /** Payer's wallet address */
  payer?: string;
}

/**
 * v2 Settle Request (to facilitator /settle endpoint)
 */
export interface SettleRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * v2 HTTP Headers
 */
export const V2_HEADERS = {
  /** Server sends payment requirements in this header */
  PAYMENT_REQUIRED: 'PAYMENT-REQUIRED',

  /** Client sends payment payload in this header */
  PAYMENT_SIGNATURE: 'PAYMENT-SIGNATURE',

  /** Server sends settlement response in this header */
  PAYMENT_RESPONSE: 'PAYMENT-RESPONSE',
} as const;
