"""Tests for `skillet.trial_limits.redis_client.UpstashRedis`.

Every HTTP call is mocked with `respx` — no live Upstash account is ever
touched. Assertions check the exact URL, method, and headers the client
sends (not just the return value), so a future change to Upstash's URL
scheme would be caught here rather than surfacing as a live failure.
"""

from urllib.parse import quote

import httpx
import pytest
import respx

from skillet.trial_limits.redis_client import UpstashError, UpstashRedis

BASE_URL = "https://fake-instance.upstash.io"
TOKEN = "test-token-abc123"


def make_redis() -> UpstashRedis:
    return UpstashRedis(base_url=BASE_URL, token=TOKEN)


def _assert_request(route: respx.Route, *, expected_url: str) -> None:
    assert route.called
    request = route.calls.last.request
    assert request.method == "GET"
    assert str(request.url) == expected_url
    assert request.headers["authorization"] == f"Bearer {TOKEN}"


@respx.mock
async def test_incr_on_fresh_key_returns_one() -> None:
    key = "trial:count:ip:abc123:20260912"
    url = f"{BASE_URL}/incr/{quote(key, safe='')}"
    route = respx.get(url).mock(return_value=httpx.Response(200, json={"result": 1}))

    redis = make_redis()
    result = await redis.incr(key)

    assert result == 1
    _assert_request(route, expected_url=url)
    await redis.aclose()


@respx.mock
async def test_incr_on_existing_key_returns_incremented_value() -> None:
    key = "trial:count:cookie:xyz:20260912"
    url = f"{BASE_URL}/incr/{quote(key, safe='')}"
    route = respx.get(url).mock(return_value=httpx.Response(200, json={"result": 4}))

    redis = make_redis()
    result = await redis.incr(key)

    assert result == 4
    _assert_request(route, expected_url=url)
    await redis.aclose()


@respx.mock
async def test_incrby_with_given_amount() -> None:
    key = "trial:budget:20260912"
    amount = 50_000
    url = f"{BASE_URL}/incrby/{quote(key, safe='')}/{amount}"
    route = respx.get(url).mock(return_value=httpx.Response(200, json={"result": 50_000}))

    redis = make_redis()
    result = await redis.incrby(key, amount)

    assert result == 50_000
    _assert_request(route, expected_url=url)
    await redis.aclose()


@respx.mock
async def test_expire_succeeds_and_sends_actual_seconds_value() -> None:
    key = "trial:count:ip:abc123:20260912"
    seconds = 25 * 60 * 60
    url = f"{BASE_URL}/expire/{quote(key, safe='')}/{seconds}"
    route = respx.get(url).mock(return_value=httpx.Response(200, json={"result": 1}))

    redis = make_redis()
    result = await redis.expire(key, seconds)

    assert result is None
    _assert_request(route, expected_url=url)
    await redis.aclose()


@respx.mock
async def test_expire_accepts_ok_string_result() -> None:
    key = "trial:budget:20260912"
    seconds = 90_000
    url = f"{BASE_URL}/expire/{quote(key, safe='')}/{seconds}"
    respx.get(url).mock(return_value=httpx.Response(200, json={"result": "OK"}))

    redis = make_redis()
    result = await redis.expire(key, seconds)

    assert result is None
    await redis.aclose()


@respx.mock
async def test_expire_with_falsy_result_raises_upstash_error() -> None:
    key = "trial:count:ip:missing:20260912"
    seconds = 90_000
    url = f"{BASE_URL}/expire/{quote(key, safe='')}/{seconds}"
    respx.get(url).mock(return_value=httpx.Response(200, json={"result": 0}))

    redis = make_redis()
    with pytest.raises(UpstashError) as exc_info:
        await redis.expire(key, seconds)

    assert exc_info.value.command == "expire"
    assert exc_info.value.key == key
    await redis.aclose()


@respx.mock
async def test_get_on_existing_key_returns_string_value() -> None:
    key = "trial:budget:20260912"
    url = f"{BASE_URL}/get/{quote(key, safe='')}"
    route = respx.get(url).mock(return_value=httpx.Response(200, json={"result": "150000"}))

    redis = make_redis()
    result = await redis.get(key)

    assert result == "150000"
    assert isinstance(result, str)
    _assert_request(route, expected_url=url)
    await redis.aclose()


@respx.mock
async def test_get_on_missing_key_returns_none_not_the_string_null() -> None:
    key = "trial:budget:19990101"
    url = f"{BASE_URL}/get/{quote(key, safe='')}"
    respx.get(url).mock(return_value=httpx.Response(200, json={"result": None}))

    redis = make_redis()
    result = await redis.get(key)

    assert result is None
    assert result != "null"
    await redis.aclose()


@respx.mock
async def test_non_2xx_response_raises_upstash_error() -> None:
    key = "trial:count:ip:bad:20260912"
    url = f"{BASE_URL}/incr/{quote(key, safe='')}"
    respx.get(url).mock(
        return_value=httpx.Response(500, json={"error": "internal server error"})
    )

    redis = make_redis()
    with pytest.raises(UpstashError) as exc_info:
        await redis.incr(key)

    assert exc_info.value.command == "incr"
    assert exc_info.value.key == key
    await redis.aclose()


@respx.mock
async def test_error_body_raises_upstash_error_with_message() -> None:
    key = "trial:count:ip:wrongtype:20260912"
    url = f"{BASE_URL}/incr/{quote(key, safe='')}"
    # A 200 status carrying an `{"error": ...}` body is treated the same as
    # a non-2xx: Upstash's REST API can report a Redis-level error (e.g. a
    # WRONGTYPE) this way even when the HTTP transport succeeded.
    respx.get(url).mock(
        return_value=httpx.Response(200, json={"error": "WRONGTYPE Operation against a key"})
    )

    redis = make_redis()
    with pytest.raises(UpstashError) as exc_info:
        await redis.incr(key)

    assert "WRONGTYPE" in str(exc_info.value)
    await redis.aclose()


@respx.mock
async def test_malformed_json_body_raises_upstash_error_not_raw_parse_exception() -> None:
    key = "trial:budget:20260912"
    url = f"{BASE_URL}/get/{quote(key, safe='')}"
    respx.get(url).mock(
        return_value=httpx.Response(
            200, content=b"<html>not json</html>", headers={"content-type": "text/html"}
        )
    )

    redis = make_redis()
    with pytest.raises(UpstashError) as exc_info:
        await redis.get(key)

    assert exc_info.value.command == "get"
    assert exc_info.value.key == key
    await redis.aclose()


@respx.mock
async def test_each_method_makes_exactly_one_http_call() -> None:
    key = "trial:count:ip:once:20260912"
    url = f"{BASE_URL}/incr/{quote(key, safe='')}"
    route = respx.get(url).mock(return_value=httpx.Response(200, json={"result": 1}))

    redis = make_redis()
    await redis.incr(key)

    assert route.call_count == 1
    await redis.aclose()


async def test_caller_supplied_client_is_not_closed_by_aclose() -> None:
    client = httpx.AsyncClient()
    redis = UpstashRedis(base_url=BASE_URL, token=TOKEN, client=client)

    await redis.aclose()

    assert not client.is_closed
    await client.aclose()


@respx.mock
async def test_async_context_manager_closes_owned_client() -> None:
    key = "trial:count:ip:ctx:20260912"
    url = f"{BASE_URL}/incr/{quote(key, safe='')}"
    respx.get(url).mock(return_value=httpx.Response(200, json={"result": 1}))

    async with UpstashRedis(base_url=BASE_URL, token=TOKEN) as redis:
        result = await redis.incr(key)
        assert result == 1

    assert redis._client.is_closed
