/**
 * x402 Protocol Compatibility Layer
 * 
 * Provides header name compatibility between v1 and v2 protocol versions.
 * 
 * @module compatibility
 */

// Header adapters (used by framework middleware packages)
export {
  HeaderAdapter,
  getHeaderNames,
  type HeaderNames,
} from './header-adapter';

// Protocol version detection (used internally)
export {
  detectProtocolVersion,
  isV1Payload,
  isV2Payload,
  isValidProtocolVersion,
  getDefaultProtocolVersion,
} from './version-detector';

