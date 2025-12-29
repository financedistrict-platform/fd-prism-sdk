/**
 * x402 Protocol Compatibility Layer
 * 
 * Provides seamless interoperability between v1 and v2 protocol versions.
 * 
 * @module compatibility
 */

// Network ID mapping
export {
  NETWORK_V1_TO_V2,
  NETWORK_V2_TO_V1,
  isV2Network,
  networkV1ToV2,
  networkV2ToV1,
  normalizeNetwork,
  extractChainId,
} from './network-mapper';

// Header adapters
export {
  HeaderAdapter,
  getHeaderNames,
  type HeaderNames,
} from './header-adapter';

// Protocol version detection
export {
  detectProtocolVersion,
  isV1Payload,
  isV2Payload,
  isValidProtocolVersion,
  getDefaultProtocolVersion,
} from './version-detector';

// Schema transformation
export {
  SchemaTransformer,
  upgradePaymentRequirements,
  downgradePaymentRequirements,
  upgradePaymentRequiredResponse,
  downgradePaymentRequiredResponse,
  upgradePaymentPayload,
  downgradePaymentPayload,
  upgradeSettlementResponse,
  downgradeSettlementResponse,
} from './schema-transformer';
