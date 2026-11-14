import base64
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5187"
BACKEND_HOST = "delivery-test.supabase.co"
REFERENCE_FIXTURE = os.environ.get("COMICCULTURE_REFERENCE_FIXTURE")
REFERENCES = json.loads(Path(REFERENCE_FIXTURE).read_text()) if REFERENCE_FIXTURE else None
CART = [{
    "versionSizeId": "00000000-0000-0000-0000-000000000030",
    "productId": "test-product",
    "slug": "test-product",
    "name": "Test product",
    "image": "",
    "price": 1000,
    "size": "M",
    "quantity": 1,
}]


def segment(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


user = {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "admin@example.invalid",
    "aud": "authenticated",
    "factors": [{"id": "test-factor", "factor_type": "totp", "status": "verified"}],
}
expires = int(time.time()) + 3600
token = f"{segment({'alg': 'HS256'})}.{segment({'sub': user['id'], 'aal': 'aal2', 'exp': expires})}.dGVzdA"
session = {"access_token": token, "refresh_token": "synthetic", "expires_at": expires, "user": user}
fee = 350
fail_reads = False
fail_saves = False
admin_role = "admin"
writes = []
order_attempts = []
unexpected = []


def mock_backend(route):
    global fee
    req = route.request
    url = urlsplit(req.url)
    if url.hostname != BACKEND_HOST:
        unexpected.append("Unexpected backend host")
        route.abort()
        return
    path = url.path
    if path == "/rest/v1/delivery_settings":
        if req.method == "PATCH":
            assert req.headers.get("authorization") == f"Bearer {token}"
            writes.append(req.post_data_json["delivery_fee"])
            if fail_saves:
                route.fulfill(status=500, json={"message": "Synthetic save outage"})
                return
            fee = writes[-1]
        elif fail_reads:
            route.fulfill(status=403, json={"message": "Synthetic read failure"})
            return
        route.fulfill(json={"delivery_fee": fee})
    elif path == "/auth/v1/user":
        route.fulfill(json=user)
    elif path == "/rest/v1/rpc/get_store_admin_role":
        route.fulfill(json=admin_role)
    elif REFERENCES and path == "/rest/v1/orders":
        query = parse_qs(url.query).get("or", [""])[0]
        orders = [{
            **row, "id": row["order_id"], "status": "pending", "created_at": "2026-11-14T00:00:00Z",
            "payment_method": "COD", "payment_status": "pending", "full_name": "Synthetic customer",
            "phone": "0771234567", "address_line1": "Synthetic address", "city": "Colombo",
            "district": "Colombo", "order_items": [],
        } for row in REFERENCES.values() if not query or f"order_reference.ilike.*{row['order_reference']}*" in query]
        route.fulfill(json=orders, headers={"Content-Range": f"0-{max(0, len(orders)-1)}/{len(orders)}"})
    elif path == "/functions/v1/checkout" and "x-checkout-id" in req.headers:
        route.fulfill(json={"path": f"{req.headers['x-checkout-id']}/receipt.png"})
    elif path == "/functions/v1/checkout":
        payload = req.post_data_json
        if REFERENCES and payload["action"] == "track":
            details = payload["input"]
            if details["email"] == "limited@example.invalid":
                return route.fulfill(status=429, json={"error": "Too many attempts."})
            row = next((row for row in REFERENCES.values() if row["order_reference"] == details["orderReference"]), None)
            return route.fulfill(json={**row, "status": "pending", "created_at": "2026-11-14T00:00:00Z", "items": []}
                                 if row and details["email"] == "shopper@example.invalid" else None)
        order_attempts.append(payload)
        assert payload["action"] == "order"
        assert payload["token"] == "synthetic-checkout-token"
        quote = payload["input"]
        if quote["expectedDeliveryFee"] != fee:
            route.fulfill(status=409, json={"code": "delivery_fee_changed"})
        else:
            assert quote["expectedTotal"] == 1000 + fee
            if quote["paymentMethod"] == "BANK_TRANSFER":
                assert quote["receiptPath"].startswith(payload["requestId"])
            route.fulfill(json={
                "order_reference": REFERENCES["current"]["order_reference"] if REFERENCES else "CC-0000001",
                "order_id": "00000000-0000-0000-0000-000000000009",
                "subtotal": 1000,
                "delivery_fee": fee,
                "total": 1000 + fee,
                "discount_amount": 0,
                "notification_token": "synthetic-notification-token",
            })
    elif path == "/functions/v1/send-order-notification":
        route.fulfill(json={})
    else:
        route.fulfill(json=[])


def setup(context):
    context.route("**/*.supabase.co/**", mock_backend)
    context.route("https://challenges.cloudflare.com/**", lambda route: route.abort())
    context.add_init_script("""
        window.turnstile = {
            render(_, options) {
                queueMicrotask(() => options.callback('synthetic-checkout-token'));
                return 'synthetic-widget';
            },
            remove() {},
        };
    """)


def fill_checkout(page):
    for label, value in {
        "Full Name": "Test Customer",
        "Phone Number": "0771234567",
        "Email": "shopper@example.invalid",
        "Address Line 1": "Test Address",
        "City": "Colombo",
    }.items():
        page.get_by_label(re.compile(f"^{label}")).fill(value)
    page.get_by_label(re.compile("^District")).select_option("Colombo")


def assert_layout(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


def check_phone_inputs(page, place_order):
    phone = page.get_by_label(re.compile("^Phone Number"))
    expect(phone).to_have_attribute("type", "tel")
    expect(phone).to_have_attribute("inputmode", "tel")
    expect(phone).to_have_attribute("autocomplete", "tel")
    attempts = len(order_attempts)
    for invalid in ("", "077123456", "077ABC4567", "07712<script>", "07712345678"):
        phone.fill("0")
        phone.fill(invalid)
        place_order.click()
        expect(phone).to_have_attribute("aria-invalid", "true")
        expect(phone).to_be_focused()
        assert len(order_attempts) == attempts

    phone.fill("0771234567")
    phone.press("End")
    phone.press("8")
    expect(phone).to_have_value("0771234567")
    expect(phone).to_have_attribute("aria-invalid", "true")
    phone.fill("0")
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    for pasted, expected in (("0" * 200, "0"), ("+94 77-123-4567", "+94 77-123-4567")):
        page.evaluate("(value) => navigator.clipboard.writeText(value)", pasted)
        phone.press("Control+a")
        phone.press("Control+v")
        expect(phone).to_have_value(expected)
        expect(phone).to_have_attribute("aria-invalid", str(len(pasted) > 24).lower())

    toggle = page.get_by_text("Add apartment or alternate phone (optional)", exact=True)
    toggle.press("Enter")
    mobile = page.get_by_label("Mobile Number (Optional)")
    expect(mobile).to_have_attribute("inputmode", "tel")
    expect(mobile).to_have_attribute("autocomplete", "section-alternate tel")
    mobile.fill("0112345678")
    place_order.click()
    expect(mobile).to_have_attribute("aria-invalid", "true")
    expect(mobile).to_be_focused()
    assert len(order_attempts) == attempts
    mobile.fill("")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge")
    admin_context = browser.new_context(viewport={"width": 1440, "height": 900})
    setup(admin_context)
    admin_context.add_init_script(f"localStorage.setItem('comicculture-admin-auth', {json.dumps(json.dumps(session))});")
    admin = admin_context.new_page()
    fail_reads = True
    admin.goto(f"{BASE_URL}/admin?section=settings")
    expect(admin.get_by_role("heading", name="Delivery settings")).to_be_visible()
    expect(admin.get_by_text("Could not load the delivery fee.")).to_be_visible()
    fail_reads = False
    admin.get_by_role("button", name="Retry", exact=True).click()
    amount = admin.get_by_label("Delivery fee (LKR)")
    expect(amount).to_have_value("350")
    save = admin.get_by_role("button", name="Save Changes")
    for invalid in ("-1", "12.345", "100000000", "Infinity", ""):
        amount.fill(invalid)
        save.click()
        expect(admin.get_by_role("alert")).to_contain_text("up to two decimal places")
    assert not writes
    fail_saves = True
    amount.fill("475.25")
    save.click()
    expect(admin.get_by_role("alert")).to_contain_text("Could not save")
    assert fee == 350
    fail_saves = False

    shopper_context = browser.new_context(viewport={"width": 390, "height": 900})
    setup(shopper_context)
    shopper_context.add_init_script(f"""
        if (!localStorage.getItem('comicculture_cart')) {{
            localStorage.setItem('comicculture_cart', {json.dumps(json.dumps(CART))});
        }}
    """)
    checkout = shopper_context.new_page()
    fail_reads = True
    checkout.goto(f"{BASE_URL}/checkout")
    place_order = checkout.get_by_role("button", name="Place Order", exact=True)
    expect(checkout.get_by_text("Could not load the delivery fee.")).to_be_visible()
    expect(place_order).to_be_disabled()
    fail_reads = False
    checkout.get_by_role("button", name="Retry delivery fee").click()
    expect(checkout.get_by_text("Rs. 1,350", exact=True).first).to_be_visible()
    checkout.get_by_role("button", name="Open cart").click()
    drawer = checkout.get_by_role("dialog")
    expect(drawer.get_by_text("Rs. 350", exact=True)).to_be_visible()
    expect(drawer.get_by_text("Rs. 1,350", exact=True)).to_be_visible()
    checkout.keyboard.press("Escape")
    expect(drawer).to_have_count(0)
    fill_checkout(checkout)
    check_phone_inputs(checkout, place_order)
    assert_layout(checkout)

    save.click()
    expect(admin.get_by_text("Delivery fee saved.", exact=False)).to_contain_text("Rs. 475.25")
    admin.reload()
    expect(amount).to_have_value("475.25")
    place_order.click()
    expect(checkout.get_by_role("alert")).to_contain_text("The delivery fee changed")
    expect(checkout.get_by_text("Rs. 1,475.25", exact=True).first).to_be_visible()
    assert len(order_attempts) == 1
    place_order.click()
    expect(checkout).to_have_url(f"{BASE_URL}/order-success")
    expect(checkout.get_by_text("Rs. 1,475.25", exact=False)).to_be_visible()
    assert len(order_attempts) == 2
    assert order_attempts[0]["requestId"] == order_attempts[1]["requestId"]
    assert order_attempts[1]["input"]["paymentMethod"] == "COD"
    assert order_attempts[1]["input"]["phone"] == "0771234567"
    assert order_attempts[1]["input"]["mobilePhone"] is None

    admin.set_viewport_size({"width": 390, "height": 900})
    amount.fill("0")
    save.click()
    expect(admin.get_by_text("Delivery fee saved.", exact=False)).to_contain_text("Delivery is free")
    assert_layout(admin)
    admin.reload()
    expect(amount).to_have_value("0")
    admin_role = "staff"
    admin.reload()
    sections = admin.get_by_role("combobox", name=re.compile("^Admin section"))
    expect(sections).to_have_value("inventory")
    expect(sections.locator("option[value=settings]")).to_have_count(0)
    expect(amount).to_have_count(0)
    assert writes == [475.25, 475.25, 0]

    checkout.goto(f"{BASE_URL}/delivery")
    expect(checkout.get_by_role("heading", name="Free island-wide delivery")).to_be_visible()
    checkout.evaluate("(cart) => localStorage.setItem('comicculture_cart', JSON.stringify(cart))", CART)
    checkout.set_viewport_size({"width": 1440, "height": 900})
    checkout.goto(f"{BASE_URL}/checkout")
    expect(checkout.get_by_text("Free", exact=True).filter(visible=True).first).to_be_visible()
    fill_checkout(checkout)
    check_phone_inputs(checkout, place_order)
    checkout.get_by_label(re.compile("^Phone Number")).fill("+94112345678")
    checkout.get_by_label("Mobile Number (Optional)").fill("+94771234567")
    checkout.get_by_text("Bank Transfer", exact=True).click()
    expect(checkout.get_by_text("Transfer Rs. 1,000", exact=False)).to_be_visible()
    receipt = checkout.get_by_label("Upload payment receipt")
    receipt_file = {
        "name": "test.png", "mimeType": "image/png", "buffer": b"mock receipt fixture",
    }
    receipt.set_input_files(receipt_file)
    expect(place_order).to_be_enabled()
    assert_layout(checkout)
    fee = 25
    place_order.click()
    expect(checkout.get_by_text("The uploaded receipt was cleared.", exact=False)).to_be_visible()
    expect(checkout.get_by_text("Transfer Rs. 1,025", exact=False)).to_be_visible()
    expect(place_order).to_be_disabled()
    receipt.set_input_files(receipt_file)
    expect(place_order).to_be_enabled()
    place_order.click()
    expect(checkout).to_have_url(f"{BASE_URL}/order-success")
    expect(checkout.get_by_text("Rs. 1,025", exact=False)).to_be_visible()
    assert order_attempts[-1]["input"]["paymentMethod"] == "BANK_TRANSFER"
    assert order_attempts[-1]["input"]["phone"] == "0112345678"
    assert order_attempts[-1]["input"]["mobilePhone"] == "0771234567"
    if REFERENCES:
        current = REFERENCES["current"]["order_reference"]
        historical = REFERENCES["historical"]["order_reference"]
        admin_role = "admin"
        admin.add_init_script("window.print = () => {};")
        for width in (390, 1440):
            for page in (checkout, admin):
                page.set_viewport_size({"width": width, "height": 900})
            assert_layout(checkout)
            expect(checkout.get_by_text(current, exact=True)).to_be_visible()
            checkout.get_by_role("link", name="Track Your Order", exact=True).click()
            ref = checkout.get_by_label("Order reference", exact=True)
            expect(ref).to_have_value(current)
            for reference in (historical, current):
                ref.fill(reference)
                checkout.get_by_label("Email Address", exact=True).fill("shopper@example.invalid")
                checkout.get_by_role("button", name="Track Order", exact=True).click()
                expect(checkout.get_by_text(reference, exact=True)).to_be_visible()
                assert_layout(checkout)
            checkout.get_by_label("Email Address", exact=True).fill("limited@example.invalid")
            checkout.get_by_role("button", name="Track Order", exact=True).click()
            expect(checkout.get_by_role("alert")).to_contain_text("Too many tracking attempts")
            checkout.go_back()
            admin.goto(f"{BASE_URL}/admin?section=orders")
            admin.get_by_text("Search and payment/date filters", exact=False).click()
            search = admin.get_by_placeholder("Order, customer, phone, email, tracking")
            for reference, other in ((historical, current), (current, historical)):
                search.fill(reference)
                expect(admin.get_by_text(reference, exact=True)).to_be_visible()
                expect(admin.get_by_text(other, exact=True)).to_have_count(0)
                assert_layout(admin)
            admin.get_by_role("button", name="Print packing slip").click()
            expect(admin.get_by_role("heading", name=current, exact=True)).to_be_visible()
            assert_layout(admin)
            admin.emulate_media(media="print")
            assert_layout(admin)
            admin.emulate_media(media="screen")
        email_fixture = json.loads(Path(os.environ["COMICCULTURE_EMAIL_FIXTURE"]).read_text())
        email_page = shopper_context.new_page()
        email_page.route("**/*", lambda route: route.abort())
        for width in (390, 1440):
            email_page.set_viewport_size({"width": width, "height": 900})
            for html in email_fixture:
                email_page.set_content(html)
                expect(email_page.get_by_text(re.compile(re.escape(current))).first).to_be_visible()
                assert_layout(email_page)
        assert email_page.locator('a[href="https://comicculture.lk/track-order"]').count() == 1
    assert not unexpected, unexpected
    browser.close()

print("PASS: desktop/mobile settings and checkout, phone typing/paste/format validation, COD quote confirmation, and Bank Transfer receipt reset (mocked backend).")
