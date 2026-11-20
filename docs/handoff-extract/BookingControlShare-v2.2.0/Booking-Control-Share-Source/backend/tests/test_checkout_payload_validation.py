import pytest

from app.services.ttd.browser_checkout import validate_checkout_payload


def valid_payload():
    return {
        "token": "test-token",
        "nonce": "test-nonce",
        "orderId": "order_rzp_test_123",
        "keyId": "rzp_test_123",
        "paymentParams": {
            "amount": 12000,
            "pgId": "15",
            "currency": "INR",
            "orderId": "TTD-order-123",
        },
    }


def test_valid_checkout_payload_is_accepted():
    validate_checkout_payload(valid_payload())


def test_checkout_payload_requires_distinct_ttd_and_razorpay_order_ids():
    payload = valid_payload()
    payload["paymentParams"]["orderId"] = payload["orderId"]
    with pytest.raises(ValueError, match="must be distinct"):
        validate_checkout_payload(payload)


def test_checkout_payload_requires_auth_fields():
    payload = valid_payload()
    del payload["nonce"]
    with pytest.raises(ValueError, match="nonce"):
        validate_checkout_payload(payload)
