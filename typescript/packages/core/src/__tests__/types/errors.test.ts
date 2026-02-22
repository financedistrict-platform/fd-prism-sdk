import {
  PrismError,
  PrismGatewayError,
  PrismNetworkError,
  PrismConfigError,
  PrismPaymentError,
  PrismValidationError,
} from '../../types/errors';

describe('PrismError', () => {
  describe('constructor', () => {
    it('should set all properties correctly', () => {
      const error = new PrismError(
        'Test error message',
        'TEST_ERROR',
        500,
        { key: 'value' }
      );

      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ key: 'value' });
      expect(error.name).toBe('PrismError');
      expect(error.stack).toBeDefined();
    });

    it('should work without details', () => {
      const error = new PrismError('Test error', 'TEST_ERROR', 500);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.details).toBeUndefined();
    });

    it('should be an instance of Error', () => {
      const error = new PrismError('Test', 'TEST', 500);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PrismError);
    });
  });

  describe('toJSON', () => {
    it('should serialize all properties', () => {
      const error = new PrismError('Test error', 'TEST_ERROR', 500, {
        additionalInfo: 'test',
      });
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'PrismError',
        message: 'Test error',
        code: 'TEST_ERROR',
        statusCode: 500,
        details: { additionalInfo: 'test' },
      });
    });

    it('should omit details if not provided', () => {
      const error = new PrismError('Test error', 'TEST_ERROR', 500);
      const json = error.toJSON();

      expect(json.details).toBeUndefined();
    });
  });
});

describe('PrismGatewayError', () => {
  describe('constructor', () => {
    it('should extend PrismError', () => {
      const error = new PrismGatewayError(
        'Gateway error',
        500,
        'trace-123',
        '2024-01-01T00:00:00Z',
        { info: 'test' }
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PrismError);
      expect(error).toBeInstanceOf(PrismGatewayError);
    });

    it('should store traceId and timestamp', () => {
      const timestamp = '2024-01-01T12:00:00Z';
      const error = new PrismGatewayError(
        'Gateway error',
        500,
        'trace-abc-123',
        timestamp
      );

      expect(error.traceId).toBe('trace-abc-123');
      expect(error.timestamp).toBe(timestamp);
      expect(error.message).toBe('Gateway error');
      expect(error.code).toBe('GATEWAY_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('PrismGatewayError');
    });

    it('should work with different status codes', () => {
      const error400 = new PrismGatewayError('Bad request', 400, 'trace-1');
      const error401 = new PrismGatewayError('Unauthorized', 401, 'trace-2');
      const error500 = new PrismGatewayError(
        'Internal error',
        500,
        'trace-3'
      );

      expect(error400.statusCode).toBe(400);
      expect(error401.statusCode).toBe(401);
      expect(error500.statusCode).toBe(500);
    });

    it('should work without optional params', () => {
      const error = new PrismGatewayError('Gateway error', 500);

      expect(error.traceId).toBeUndefined();
      expect(error.timestamp).toBeUndefined();
      expect(error.statusCode).toBe(500);
    });
  });

  describe('toJSON', () => {
    it('should include traceId and timestamp', () => {
      const timestamp = '2024-01-01T12:00:00Z';
      const error = new PrismGatewayError(
        'Gateway error',
        500,
        'trace-123',
        timestamp,
        { reason: 'Database connection failed' }
      );

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'PrismGatewayError',
        message: 'Gateway error',
        code: 'GATEWAY_ERROR',
        statusCode: 500,
        details: { reason: 'Database connection failed' },
        traceId: 'trace-123',
        timestamp: timestamp,
      });
    });

    it('should include undefined traceId and timestamp if not provided', () => {
      const error = new PrismGatewayError('Gateway error', 500);
      const json = error.toJSON();

      expect(json.traceId).toBeUndefined();
      expect(json.timestamp).toBeUndefined();
    });
  });
});

describe('PrismNetworkError', () => {
  describe('constructor', () => {
    it('should always have statusCode 503', () => {
      const originalError = new Error('Connection timeout');
      const error = new PrismNetworkError(
        'Network request failed',
        originalError
      );

      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Network request failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.originalError).toBe(originalError);
      expect(error.name).toBe('PrismNetworkError');
    });

    it('should store originalError', () => {
      const originalError = new Error('ETIMEDOUT');
      const error = new PrismNetworkError('Connection timeout', originalError);

      expect(error.originalError).toBe(originalError);
      expect(error.originalError.message).toBe('ETIMEDOUT');
    });

    it('should be an instance of PrismError', () => {
      const originalError = new Error('Network error');
      const error = new PrismNetworkError('Network error', originalError);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PrismError);
      expect(error).toBeInstanceOf(PrismNetworkError);
    });

    it('should pass originalError as details to parent', () => {
      const originalError = new Error('ECONNREFUSED');
      const error = new PrismNetworkError('Connection refused', originalError);

      // originalError passed as 4th param (details) to PrismError
      expect(error.details).toBe(originalError);
    });
  });
});

describe('PrismConfigError', () => {
  describe('constructor', () => {
    it('should always have statusCode 500', () => {
      const error = new PrismConfigError('Invalid API key');

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Invalid API key');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.name).toBe('PrismConfigError');
    });

    it('should work with details', () => {
      const error = new PrismConfigError('Missing configuration', {
        required: ['apiKey', 'baseUrl'],
      });

      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ required: ['apiKey', 'baseUrl'] });
    });

    it('should be an instance of PrismError', () => {
      const error = new PrismConfigError('Config error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PrismError);
      expect(error).toBeInstanceOf(PrismConfigError);
    });
  });
});

describe('PrismPaymentError', () => {
  describe('constructor', () => {
    it('should always have statusCode 402', () => {
      const error = new PrismPaymentError('Invalid payment signature');

      expect(error.statusCode).toBe(402);
      expect(error.message).toBe('Invalid payment signature');
      expect(error.code).toBe('PAYMENT_ERROR');
      expect(error.name).toBe('PrismPaymentError');
    });

    it('should work with details', () => {
      const error = new PrismPaymentError('Payment verification failed', {
        reason: 'Signature mismatch',
        payer: '0x123...',
      });

      expect(error.statusCode).toBe(402);
      expect(error.details).toEqual({
        reason: 'Signature mismatch',
        payer: '0x123...',
      });
    });

    it('should be an instance of PrismError', () => {
      const error = new PrismPaymentError('Payment error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PrismError);
      expect(error).toBeInstanceOf(PrismPaymentError);
    });
  });
});

describe('PrismValidationError', () => {
  describe('constructor', () => {
    it('should always have statusCode 400', () => {
      const error = new PrismValidationError('Invalid field value', 'amount');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid field value');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.field).toBe('amount');
      expect(error.name).toBe('PrismValidationError');
    });

    it('should work without field', () => {
      const error = new PrismValidationError('Validation failed');

      expect(error.statusCode).toBe(400);
      expect(error.field).toBeUndefined();
    });

    it('should work with field and details', () => {
      const error = new PrismValidationError(
        'Amount must be positive',
        'amount',
        { min: 0.01, provided: -5 }
      );

      expect(error.statusCode).toBe(400);
      expect(error.field).toBe('amount');
      expect(error.details).toEqual({ min: 0.01, provided: -5 });
    });

    it('should be an instance of PrismError', () => {
      const error = new PrismValidationError('Validation error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PrismError);
      expect(error).toBeInstanceOf(PrismValidationError);
    });
  });

  describe('toJSON', () => {
    it('should include field property', () => {
      const error = new PrismValidationError('Invalid amount', 'amount', {
        min: 0.01,
      });
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'PrismValidationError',
        message: 'Invalid amount',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: { min: 0.01 },
        field: 'amount',
      });
    });

    it('should include undefined field if not provided', () => {
      const error = new PrismValidationError('Validation failed');
      const json = error.toJSON();

      expect(json.field).toBeUndefined();
    });
  });
});
