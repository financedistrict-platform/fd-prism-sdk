from __future__ import annotations

import asyncio
import base64
import json
import threading
from copy import deepcopy
from unittest.mock import AsyncMock, patch

import pytest

from prism_sdk_core import PrismMiddlewareConfig, PrismMiddlewareCore, RoutePaymentConfig

ROUTE_PATH = '/api/premium'
RESOURCE_URL = 'https://example.com/api/premium'
PAY_TO = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'
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


def v2_payload(nonce='0xnonce', signature='0xsignature', valid_before=NOW + 60):
    return {
        'x402Version': 2,
        'accepted': dict(REQUIREMENT),
        'payload': {
            'signature': signature,
            'authorization': {
                'from': '0x1111111111111111111111111111111111111111',
                'to': PAY_TO,
                'value': '10000',
                'validAfter': str(NOW - 60),
                'validBefore': str(valid_before),
                'nonce': nonce,
            },
        },
    }


def encode(value) -> str:
    return base64.b64encode(json.dumps(value).encode('utf-8')).decode('ascii')


@pytest.fixture(autouse=True)
def frozen_clock():
    with patch('time.time', return_value=NOW) as clock:
        yield clock


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


@pytest.fixture
def core(client):
    config = PrismMiddlewareConfig(api_key='test-key')
    return PrismMiddlewareCore(config, {ROUTE_PATH: RoutePaymentConfig(price=0.01, description='Premium API')})


def submit_sync(core, payload):
    return core.handle_request(path=ROUTE_PATH, resource_url=RESOURCE_URL, payment_header=encode(payload))


def submit_async(core, payload):
    return asyncio.run(
        core.ahandle_request(path=ROUTE_PATH, resource_url=RESOURCE_URL, payment_header=encode(payload))
    )


SUBMITTERS = [pytest.param(submit_sync, id='sync'), pytest.param(submit_async, id='async')]


def settle(core, result, status_code, is_async):
    info = result.payment_info
    if is_async:
        return asyncio.run(core.asettlement_callback(info['payment'], info['payment_requirements'], status_code))
    return core.settlement_callback(info['payment'], info['payment_requirements'], status_code)


class TestParallelProofReplay:
    def test_threads_sharing_one_proof_admit_exactly_one(self, core, client):
        payload = v2_payload('0xparallel')
        barrier = threading.Barrier(20)
        results = []
        lock = threading.Lock()

        def worker():
            barrier.wait()
            outcome = submit_sync(core, payload)
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=worker) for _ in range(20)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        admitted = [r for r in results if r.payment_info is not None]
        rejected = [r for r in results if r.handled]
        assert len(admitted) == 1
        assert len(rejected) == 19
        assert all(r.status_code == 402 for r in rejected)
        assert client.verify_payment.call_count == 1

    def test_concurrent_async_requests_sharing_one_proof_admit_exactly_one(self, core, client):
        payload = v2_payload('0xasync-parallel')

        async def run():
            return await asyncio.gather(
                *[
                    core.ahandle_request(path=ROUTE_PATH, resource_url=RESOURCE_URL, payment_header=encode(payload))
                    for _ in range(20)
                ]
            )

        results = asyncio.run(run())

        assert len([r for r in results if r.payment_info is not None]) == 1
        assert len([r for r in results if r.handled]) == 19
        assert client.averify_payment.await_count == 1

    @pytest.mark.parametrize('submit', SUBMITTERS)
    def test_second_request_with_same_proof_is_rejected_while_first_is_in_flight(self, submit, core):
        first = submit(core, v2_payload('0xsequential'))
        second = submit(core, v2_payload('0xsequential'))

        assert first.payment_info is not None
        assert second.handled is True
        assert second.status_code == 402
        assert second.payment_info is None

    @pytest.mark.parametrize('submit', SUBMITTERS)
    def test_different_signature_over_same_authorization_is_the_same_proof(self, submit, core):
        first = submit(core, v2_payload('0xmalleable', signature='0xsignature-a'))
        second = submit(core, v2_payload('0xmalleable', signature='0xsignature-b'))

        assert first.payment_info is not None
        assert second.handled is True

    @pytest.mark.parametrize('submit', SUBMITTERS)
    def test_different_nonces_do_not_block_each_other(self, submit, core):
        first = submit(core, v2_payload('0xone'))
        second = submit(core, v2_payload('0xtwo'))

        assert first.payment_info is not None
        assert second.payment_info is not None

    @pytest.mark.parametrize('submit', SUBMITTERS)
    def test_proof_is_released_when_the_gateway_rejects_it(self, submit, core, client):
        client.verify_payment.return_value = {'valid': False, 'error': 'bad signature'}
        client.averify_payment.return_value = {'valid': False, 'error': 'bad signature'}
        rejected = submit(core, v2_payload('0xinvalid'))

        client.verify_payment.return_value = {'valid': True, 'payer': '0xPAYER'}
        client.averify_payment.return_value = {'valid': True, 'payer': '0xPAYER'}
        retried = submit(core, v2_payload('0xinvalid'))

        assert rejected.handled is True
        assert retried.payment_info is not None

    @pytest.mark.parametrize('submit', SUBMITTERS)
    def test_proof_is_released_when_verification_raises(self, submit, core, client):
        client.verify_payment.side_effect = RuntimeError('gateway down')
        client.averify_payment.side_effect = RuntimeError('gateway down')
        failed = submit(core, v2_payload('0xraises'))

        client.verify_payment.side_effect = None
        client.averify_payment.side_effect = None
        retried = submit(core, v2_payload('0xraises'))

        assert failed.status_code == 500
        assert retried.payment_info is not None

    @pytest.mark.parametrize('is_async', [False, True], ids=['sync', 'async'])
    def test_proof_is_released_when_the_handler_responds_with_an_error_status(self, is_async, core, client):
        submit = submit_async if is_async else submit_sync
        first = submit(core, v2_payload('0xhandler-error'))

        settle(core, first, 500, is_async)
        retried = submit(core, v2_payload('0xhandler-error'))

        client.settle_payment.assert_not_called()
        assert retried.payment_info is not None

    @pytest.mark.parametrize('is_async', [False, True], ids=['sync', 'async'])
    def test_proof_is_released_when_settlement_fails(self, is_async, core, client):
        client.settle_payment.return_value = {'success': False, 'errorReason': 'insufficient funds'}
        client.asettle_payment.return_value = {'success': False, 'errorReason': 'insufficient funds'}
        submit = submit_async if is_async else submit_sync
        first = submit(core, v2_payload('0xsettle-fails'))

        settle(core, first, 200, is_async)
        retried = submit(core, v2_payload('0xsettle-fails'))

        assert retried.payment_info is not None

    @pytest.mark.parametrize('is_async', [False, True], ids=['sync', 'async'])
    def test_proof_stays_consumed_after_a_successful_settlement(self, is_async, core):
        submit = submit_async if is_async else submit_sync
        first = submit(core, v2_payload('0xsettled'))

        settled = settle(core, first, 200, is_async)
        replay = submit(core, v2_payload('0xsettled'))

        assert settled['success'] is True
        assert replay.handled is True
        assert replay.status_code == 402

    def test_abandoned_reservation_expires(self, core, frozen_clock):
        payload = v2_payload('0xabandoned', valid_before=NOW + 3600)
        submit_sync(core, payload)
        before_expiry = submit_sync(core, payload)

        frozen_clock.return_value = NOW + 61
        after_expiry = submit_sync(core, payload)

        assert before_expiry.handled is True
        assert after_expiry.payment_info is not None

    def test_tracked_proofs_are_bounded_and_fail_closed(self, core):
        results = [submit_sync(core, v2_payload(f'0xflood-{i}')) for i in range(10_050)]

        assert len([r for r in results if r.payment_info is not None]) == 10_000
        assert len([r for r in results if r.handled]) == 50


@pytest.fixture
def settling_core(client):
    config = PrismMiddlewareConfig(api_key='test-key')
    routes = {
        ROUTE_PATH: RoutePaymentConfig(price=0.01, description='Premium API', settle_before_handler=True)
    }
    return PrismMiddlewareCore(config, routes)


class TestSettleBeforeHandler:
    @pytest.mark.parametrize('submit', SUBMITTERS)
    def test_default_routes_do_not_settle_while_handling_the_request(self, submit, core, client):
        result = submit(core, v2_payload('0xdefault'))

        assert result.payment_info is not None
        client.settle_payment.assert_not_called()
        client.asettle_payment.assert_not_called()

    def test_settles_before_returning_control_to_the_handler(self, settling_core, client):
        result = submit_sync(settling_core, v2_payload('0xsettle-first'))

        assert result.handled is False
        assert result.payment_info is not None
        client.settle_payment.assert_called_once()

    def test_async_settles_before_returning_control_to_the_handler(self, settling_core, client):
        result = submit_async(settling_core, v2_payload('0xsettle-first-async'))

        assert result.payment_info is not None
        client.asettle_payment.assert_awaited_once()

    @pytest.mark.parametrize('is_async', [False, True], ids=['sync', 'async'])
    def test_reuses_the_settlement_instead_of_settling_after_the_handler(self, is_async, settling_core, client):
        submit = submit_async if is_async else submit_sync
        admitted = submit(settling_core, v2_payload('0xsettle-once'))

        settled = settle(settling_core, admitted, 200, is_async)

        assert settled['transaction'] == '0xtx'
        assert client.settle_payment.call_count + client.asettle_payment.await_count == 1

    def test_threads_sharing_one_proof_settle_exactly_once(self, settling_core, client):
        payload = v2_payload('0xsettle-parallel')
        barrier = threading.Barrier(20)
        results = []
        lock = threading.Lock()

        def worker():
            barrier.wait()
            outcome = submit_sync(settling_core, payload)
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=worker) for _ in range(20)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert len([r for r in results if r.payment_info is not None]) == 1
        assert client.settle_payment.call_count == 1

    @pytest.mark.parametrize('is_async', [False, True], ids=['sync', 'async'])
    def test_rejects_the_request_and_releases_the_proof_when_settlement_fails(self, is_async, settling_core, client):
        submit = submit_async if is_async else submit_sync
        client.settle_payment.return_value = {'success': False, 'errorReason': 'insufficient funds'}
        client.asettle_payment.return_value = {'success': False, 'errorReason': 'insufficient funds'}
        failed = submit(settling_core, v2_payload('0xsettle-first-fails'))

        client.settle_payment.return_value = {'success': True, 'transaction': '0xtx'}
        client.asettle_payment.return_value = {'success': True, 'transaction': '0xtx'}
        retried = submit(settling_core, v2_payload('0xsettle-first-fails'))

        assert failed.handled is True
        assert failed.status_code == 402
        assert failed.payment_info is None
        assert retried.payment_info is not None

    @pytest.mark.parametrize('is_async', [False, True], ids=['sync', 'async'])
    def test_proof_stays_consumed_when_the_handler_fails_after_settlement(self, is_async, settling_core):
        submit = submit_async if is_async else submit_sync
        admitted = submit(settling_core, v2_payload('0xsettled-handler-fails'))

        settle(settling_core, admitted, 500, is_async)
        replay = submit(settling_core, v2_payload('0xsettled-handler-fails'))

        assert replay.handled is True
        assert replay.status_code == 402
