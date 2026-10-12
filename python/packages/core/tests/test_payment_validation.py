from __future__ import annotations

import asyncio
import base64
import json
from copy import deepcopy
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from prism_sdk_core import PrismMiddlewareConfig, PrismMiddlewareCore, RoutePaymentConfig

ROUTE_PATH = '/api/premium'
RESOURCE_URL = 'https://example.com/api/premium'
PAY_TO = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'
OTHER_ADDRESS = '0x2222222222222222222222222222222222222222'
ASSET = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'
NOW = 1_800_000_000

REQUIREMENT = {
    'scheme': 'exact',
    'network': 'eip155:84532',
    'amount': '10000',
    'asset': ASSET,
    'payTo': PAY_TO,
    'maxTimeoutSeconds': 60,
}

REQUIREMENTS_RESPONSE = {
    'x402Version': 2,
    'resource': {'url': RESOURCE_URL},
    'accepts': [REQUIREMENT],
}

V1_REQUIREMENT = {
    'scheme': 'exact',
    'network': 'eip155:84532',
    'maxAmountRequired': '10000',
    'resource': RESOURCE_URL,
    'payTo': PAY_TO,
    'maxTimeoutSeconds': 60,
    'asset': ASSET,
}


def authorization(**overrides):
    base = {
        'from': '0x1111111111111111111111111111111111111111',
        'to': PAY_TO,
        'value': '10000',
        'validAfter': str(NOW - 60),
        'validBefore': str(NOW + 60),
        'nonce': '0xnonce',
    }
    base.update(overrides)
    return base


def v2_payload(accepted=None, auth=None, resource=None):
    payload = {
        'x402Version': 2,
        'accepted': {**REQUIREMENT, **(accepted or {})},
        'payload': {'signature': '0xsignature', 'authorization': authorization(**(auth or {}))},
    }
    if resource is not None:
        payload['resource'] = resource
    return payload


def v1_payload(auth=None):
    return {
        'x402Version': 1,
        'scheme': 'exact',
        'network': 'base-sepolia',
        'payload': {'signature': '0xsignature', 'authorization': authorization(**(auth or {}))},
    }


def encode(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


@pytest.fixture(autouse=True)
def frozen_clock():
    with patch('time.time', return_value=NOW):
        yield


@pytest.fixture
def client():
    with patch('prism_sdk_core.PrismClient') as client_class:
        instance = client_class.return_value
        instance.get_payment_requirements.return_value = deepcopy(REQUIREMENTS_RESPONSE)
        instance.verify_payment.return_value = {'valid': True, 'payer': '0xPAYER'}
        instance.settle_payment.return_value = {'success': True, 'transaction': '0xtx'}
        instance.aget_payment_requirements = AsyncMock(return_value=deepcopy(REQUIREMENTS_RESPONSE))
        instance.averify_payment = AsyncMock(return_value={'valid': True, 'payer': '0xPAYER'})
        instance.asettle_payment = AsyncMock(return_value={'success': True, 'transaction': '0xtx'})
        yield instance


def make_core(allowed_versions=None):
    config = PrismMiddlewareConfig(api_key='test-key', allowed_versions=allowed_versions)
    return PrismMiddlewareCore(config, {ROUTE_PATH: RoutePaymentConfig(price=0.01, description='Premium API')})


def submit_sync(payload, core=None):
    core = core or make_core()
    return core.handle_request(path=ROUTE_PATH, resource_url=RESOURCE_URL, payment_header=encode(payload))


def submit_async(payload, core=None):
    core = core or make_core()
    return asyncio.run(
        core.ahandle_request(path=ROUTE_PATH, resource_url=RESOURCE_URL, payment_header=encode(payload))
    )


SUBMITTERS = [pytest.param(submit_sync, id='sync'), pytest.param(submit_async, id='async')]


def assert_rejected_locally(result, client):
    assert result.handled is True
    assert result.status_code == 402
    assert result.payment_info is None
    client.verify_payment.assert_not_called()
    client.averify_payment.assert_not_called()
    client.settle_payment.assert_not_called()
    client.asettle_payment.assert_not_called()


@pytest.mark.parametrize('submit', SUBMITTERS)
class TestPaymentThatSatisfiesTheRequirement:
    def test_is_forwarded_to_verify_with_the_server_built_requirement(self, submit, client):
        result = submit(v2_payload())

        assert result.handled is False
        assert result.payment_info['payer'] == '0xPAYER'
        verify = client.verify_payment if submit is submit_sync else client.averify_payment
        verify.assert_called_once()
        assert verify.call_args.args[1] == REQUIREMENT

    def test_accepts_addresses_that_differ_only_by_letter_case(self, submit, client):
        result = submit(
            v2_payload(
                accepted={'payTo': PAY_TO.lower(), 'asset': ASSET.lower()},
                auth={'to': PAY_TO.upper().replace('0X', '0x')},
            )
        )

        assert result.handled is False

    def test_selects_the_requirement_the_payload_accepted(self, submit, client):
        second = {**REQUIREMENT, 'amount': '20000', 'payTo': '0xSecondPayee'}
        response = {**REQUIREMENTS_RESPONSE, 'accepts': [REQUIREMENT, second]}
        client.get_payment_requirements.return_value = deepcopy(response)
        client.aget_payment_requirements.return_value = deepcopy(response)

        result = submit(
            v2_payload(
                accepted={'amount': '20000', 'payTo': '0xSecondPayee'},
                auth={'to': '0xSecondPayee', 'value': '20000'},
            )
        )

        assert result.handled is False
        assert result.payment_info['payment_requirements'] == second


@pytest.mark.parametrize('submit', SUBMITTERS)
class TestPaymentThatDoesNotSatisfyTheRequirement:
    def test_rejects_authorization_paying_a_different_recipient(self, submit, client):
        assert_rejected_locally(submit(v2_payload(auth={'to': OTHER_ADDRESS})), client)

    def test_rejects_authorization_with_a_lower_value(self, submit, client):
        assert_rejected_locally(submit(v2_payload(auth={'value': '1'})), client)

    def test_rejects_authorization_with_a_higher_value(self, submit, client):
        assert_rejected_locally(submit(v2_payload(auth={'value': '10001'})), client)

    def test_rejects_non_numeric_authorization_value(self, submit, client):
        assert_rejected_locally(submit(v2_payload(auth={'value': '1e4'})), client)

    def test_rejects_accepted_block_naming_a_different_recipient(self, submit, client):
        assert_rejected_locally(submit(v2_payload(accepted={'payTo': OTHER_ADDRESS})), client)

    def test_rejects_accepted_block_naming_a_different_amount(self, submit, client):
        assert_rejected_locally(
            submit(v2_payload(accepted={'amount': '1'}, auth={'value': '1'})), client
        )

    def test_rejects_accepted_block_naming_a_different_asset(self, submit, client):
        assert_rejected_locally(submit(v2_payload(accepted={'asset': OTHER_ADDRESS})), client)

    def test_rejects_accepted_block_naming_a_different_network(self, submit, client):
        assert_rejected_locally(submit(v2_payload(accepted={'network': 'eip155:1'})), client)

    def test_rejects_accepted_block_without_an_amount(self, submit, client):
        payload = v2_payload()
        del payload['accepted']['amount']
        assert_rejected_locally(submit(payload), client)

    def test_rejects_accepted_block_without_a_recipient(self, submit, client):
        payload = v2_payload()
        del payload['accepted']['payTo']
        assert_rejected_locally(submit(payload), client)

    def test_rejects_expired_authorization(self, submit, client):
        assert_rejected_locally(submit(v2_payload(auth={'validBefore': str(NOW - 1)})), client)

    def test_rejects_authorization_expiring_at_the_current_second(self, submit, client):
        assert_rejected_locally(submit(v2_payload(auth={'validBefore': str(NOW)})), client)

    def test_rejects_authorization_that_is_not_yet_valid(self, submit, client):
        assert_rejected_locally(submit(v2_payload(auth={'validAfter': str(NOW + 1)})), client)

    def test_rejects_non_numeric_validity_window(self, submit, client):
        assert_rejected_locally(submit(v2_payload(auth={'validBefore': 'soon'})), client)

    def test_rejects_payload_bound_to_a_different_resource(self, submit, client):
        assert_rejected_locally(
            submit(v2_payload(resource={'url': 'https://example.com/api/other'})), client
        )


@pytest.mark.parametrize('submit', SUBMITTERS)
class TestV1Payload:
    @pytest.fixture(autouse=True)
    def v1_requirements(self, client):
        response = {'x402Version': 1, 'accepts': [V1_REQUIREMENT]}
        client.get_payment_requirements.return_value = deepcopy(response)
        client.aget_payment_requirements.return_value = deepcopy(response)

    def test_is_forwarded_to_verify_when_it_satisfies_the_requirement(self, submit, client):
        result = submit(v1_payload(), make_core(allowed_versions=[1, 2]))

        assert result.handled is False

    def test_rejects_authorization_paying_a_different_recipient(self, submit, client):
        result = submit(v1_payload(auth={'to': OTHER_ADDRESS}), make_core(allowed_versions=[1, 2]))

        assert_rejected_locally(result, client)

    def test_rejects_authorization_with_a_different_value(self, submit, client):
        result = submit(v1_payload(auth={'value': '1'}), make_core(allowed_versions=[1, 2]))

        assert_rejected_locally(result, client)

    def test_rejects_expired_authorization(self, submit, client):
        result = submit(
            v1_payload(auth={'validBefore': str(NOW - 1)}), make_core(allowed_versions=[1, 2])
        )

        assert_rejected_locally(result, client)


class TestSettlementCallback:
    def test_settles_a_payment_that_matches_its_requirement(self, client):
        result = make_core().settlement_callback(v2_payload(), REQUIREMENT, 200)

        assert result['success'] is True
        client.settle_payment.assert_called_once()

    @pytest.mark.parametrize(
        'payload',
        [
            pytest.param(v2_payload(auth={'to': OTHER_ADDRESS}), id='recipient'),
            pytest.param(v2_payload(auth={'value': '1'}), id='value'),
            pytest.param(v2_payload(accepted={'amount': '1'}), id='accepted'),
        ],
    )
    def test_does_not_call_the_gateway_for_a_mismatched_payment(self, payload, client):
        sync_result = make_core().settlement_callback(payload, REQUIREMENT, 200)
        async_result = asyncio.run(make_core().asettlement_callback(payload, REQUIREMENT, 200))

        assert sync_result['success'] is False
        assert async_result['success'] is False
        client.settle_payment.assert_not_called()
        client.asettle_payment.assert_not_called()


def call_with_version(core, payload, protocol_version, is_async):
    kwargs = dict(
        path=ROUTE_PATH,
        resource_url=RESOURCE_URL,
        payment_header=encode(payload),
        protocol_version=protocol_version,
    )
    if is_async:
        return asyncio.run(core.ahandle_request(**kwargs))
    return core.handle_request(**kwargs)


def assert_rejected_before_gateway(result, client):
    assert result.handled is True
    assert result.status_code == 402
    assert result.payment_info is None
    client.get_payment_requirements.assert_not_called()
    client.aget_payment_requirements.assert_not_called()
    client.verify_payment.assert_not_called()
    client.averify_payment.assert_not_called()
    client.settle_payment.assert_not_called()
    client.asettle_payment.assert_not_called()


@pytest.mark.parametrize('submit', SUBMITTERS)
class TestAllowedVersions:
    def test_rejects_v1_payload_under_the_default_allowed_versions(self, submit, client):
        result = submit(v1_payload())

        assert_rejected_before_gateway(result, client)

    def test_rejects_v1_payload_when_only_v2_is_allowed(self, submit, client):
        result = submit(v1_payload(), make_core(allowed_versions=[2]))

        assert_rejected_before_gateway(result, client)

    def test_rejects_v2_payload_when_only_v1_is_allowed(self, submit, client):
        result = submit(v2_payload(), make_core(allowed_versions=[1]))

        assert_rejected_before_gateway(result, client)

    def test_rejects_unsupported_declared_version(self, submit, client):
        payload = v1_payload()
        payload['x402Version'] = 5

        result = submit(payload)

        assert_rejected_before_gateway(result, client)

    @pytest.mark.parametrize('declared', [3, '2', True, None], ids=['three', 'string-two', 'boolean', 'null'])
    def test_rejects_flat_payload_declaring_an_unrecognised_version(self, submit, client, declared):
        payload = v1_payload()
        payload['x402Version'] = declared

        result = submit(payload, make_core(allowed_versions=[1, 2]))

        assert_rejected_before_gateway(result, client)

    def test_rejects_flat_payload_without_a_declared_version(self, submit, client):
        payload = v1_payload()
        del payload['x402Version']

        result = submit(payload)

        assert_rejected_before_gateway(result, client)

    def test_accepts_v2_payload_under_the_default_allowed_versions(self, submit, client):
        result = submit(v2_payload())

        assert result.handled is False


@pytest.mark.parametrize('is_async', [False, True], ids=['sync', 'async'])
class TestAllowedVersionsWithAdapterSuppliedVersion:
    def test_rejects_v1_payload_when_the_adapter_passes_the_version_detected_from_it(self, is_async, client):
        result = call_with_version(make_core(), v1_payload(), 1, is_async)

        assert_rejected_before_gateway(result, client)

    def test_rejects_v2_payload_when_the_adapter_passes_the_version_detected_from_it(self, is_async, client):
        result = call_with_version(make_core(allowed_versions=[1]), v2_payload(), 2, is_async)

        assert_rejected_before_gateway(result, client)
