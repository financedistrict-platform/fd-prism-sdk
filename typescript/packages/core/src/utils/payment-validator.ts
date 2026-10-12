type JsonRecord = Record<string, any>;

const DECIMAL_INTEGER = /^\d+$/;

const sameText = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

const sameAmount = (a: unknown, b: unknown): boolean =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  DECIMAL_INTEGER.test(a) &&
  DECIMAL_INTEGER.test(b) &&
  BigInt(a) === BigInt(b);

export function isV2PaymentPayload(payload: unknown): boolean {
  return (payload as JsonRecord | null)?.x402Version === 2;
}

export function requiredAmount(requirement: JsonRecord): string | undefined {
  return requirement.amount ?? requirement.maxAmountRequired;
}

export function paymentAcceptsRequirement(payload: JsonRecord, requirement: JsonRecord): boolean {
  if (!isV2PaymentPayload(payload)) {
    return payload.scheme === requirement.scheme && payload.network === requirement.network;
  }

  const accepted = payload.accepted as JsonRecord | undefined;
  return (
    !!accepted &&
    accepted.scheme === requirement.scheme &&
    accepted.network === requirement.network &&
    sameText(accepted.asset, requirement.asset) &&
    sameText(accepted.payTo, requirement.payTo) &&
    sameAmount(accepted.amount, requiredAmount(requirement))
  );
}

export function validatePaymentBinding(payload: JsonRecord, requirement: JsonRecord): string | null {
  if (!paymentAcceptsRequirement(payload, requirement)) {
    return 'Payment does not match the payment requirement';
  }

  const authorization = payload.payload?.authorization as JsonRecord | undefined;
  if (!authorization) {
    return 'Payment authorization is missing';
  }
  if (!sameText(authorization.to, requirement.payTo)) {
    return 'Payment recipient does not match the payment requirement';
  }
  if (!sameAmount(authorization.value, requiredAmount(requirement))) {
    return 'Payment amount does not match the payment requirement';
  }
  return null;
}

export function validatePaymentWindow(payload: JsonRecord, nowSeconds: number): string | null {
  const authorization = payload.payload?.authorization as JsonRecord | undefined;
  const validAfter = authorization?.validAfter;
  const validBefore = authorization?.validBefore;

  if (!DECIMAL_INTEGER.test(validAfter ?? '') || !DECIMAL_INTEGER.test(validBefore ?? '')) {
    return 'Payment validity window is malformed';
  }
  if (BigInt(validAfter) > BigInt(nowSeconds)) {
    return 'Payment is not yet valid';
  }
  if (BigInt(validBefore) <= BigInt(nowSeconds)) {
    return 'Payment has expired';
  }
  return null;
}

export function validatePaymentResource(
  payload: JsonRecord,
  expectedResourceUrl: string
): string | null {
  const resource = payload.resource;
  if (resource === undefined || resource === null) {
    return null;
  }
  return resource.url === expectedResourceUrl
    ? null
    : 'Payment resource does not match the requested resource';
}

export function findRequirementForPayment<T extends JsonRecord>(
  requirements: T[],
  payload: JsonRecord
): T | undefined {
  return requirements.find((requirement) => paymentAcceptsRequirement(payload, requirement));
}
