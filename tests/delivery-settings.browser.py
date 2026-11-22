import base64
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5187"
BACKEND_HOST = "delivery-test.supabase.co"
REFERENCE_FIXTURE = os.environ.get("COMICCULTURE_REFERENCE_FIXTURE")
REFERENCES = json.loads(Path(REFERENCE_FIXTURE).read_text()) if REFERENCE_FIXTURE else None
DASHBOARD_FIXTURE = os.environ.get("COMICCULTURE_DASHBOARD_FIXTURE")
DASHBOARD = json.loads(Path(DASHBOARD_FIXTURE).read_text()) if DASHBOARD_FIXTURE else None
DASHBOARD_SCREENSHOTS = os.environ.get("COMICCULTURE_DASHBOARD_SCREENSHOTS")
FEATURE_SCREENSHOTS = os.environ.get("COMICCULTURE_FEATURE_SCREENSHOTS")
PRIVACY_SCREENSHOTS = os.environ.get("COMICCULTURE_PRIVACY_SCREENSHOTS")
BUILD_DIR = Path(os.environ["COMICCULTURE_BROWSER_BUILD"]).resolve() if os.environ.get("COMICCULTURE_BROWSER_BUILD") else None
CONSENT_KEY = "comicculture-conversion-choice"
VISIT_KEY = "comicculture-conversion-session"
PRODUCT = {
    "id": "test-product", "slug": "test-product", "name": "Test design", "product_code": "QA-DESIGN",
    "collection": "", "collection_id": None, "tagline": "Synthetic fixture", "description": "A test design.", "lore": "",
    "image": "/images/logo/comicculture-logo.png", "images": [], "featured": True, "created_at": "2026-11-14T00:00:00Z",
    "versions": [{"id": "qa-version", "product_id": "test-product", "version_name": "Cotton",
                  "product_type": "oversized_tshirt", "images": [], "is_preorder": False, "is_active": True,
                  "sort_order": 0, "sizes": [{"id": "00000000-0000-0000-0000-000000000030", "version_id": "qa-version",
                                               "size": "M", "sku": "QA-M", "price": 1000, "stock": 10}]}],
}
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
dashboard_requests = []
dashboard_state = "normal"
notifications_retried = []
confirmation_requests = []


def mock_backend(route):
    global fee
    req = route.request
    url = urlsplit(req.url)
    if url.hostname != BACKEND_HOST:
        unexpected.append("Unexpected backend host")
        route.abort()
        return
    path = url.path
    if path == "/rest/v1/rpc/admin_checkout_conversion" or (
        path == "/functions/v1/checkout" and "x-checkout-id" not in req.headers
        and req.method == "POST" and req.post_data_json.get("action") == "analytics"
    ):
        unexpected.append(f"Retired analytics request: {path}")
        return route.fulfill(status=400, json={"message": "Retired endpoint"})
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
    elif path == "/rest/v1/products":
        route.fulfill(json=[PRODUCT])
    elif REFERENCES and path == "/rest/v1/rpc/admin_order_status_emails":
        order_id = REFERENCES["current"]["order_id"]
        second_id = REFERENCES["historical"]["order_id"]
        rows = [
            {"id": "sent-qa", "order_id": order_id, "order_status": "shipped", "state": "sent",
             "reason": None, "sent_at": "2026-11-14T00:00:00Z", "retryable": False},
            {"id": "skipped-qa", "order_id": order_id, "order_status": "confirmed", "state": "skipped",
             "reason": "covered_by_confirmation", "sent_at": None, "retryable": False},
            {"id": "pending-qa", "order_id": second_id, "order_status": "packed", "state": "pending",
             "reason": None, "sent_at": None, "retryable": False},
            {"id": "failed-qa", "order_id": order_id, "order_status": "delivered",
             "state": "pending" if notifications_retried else "failed",
             "reason": None if notifications_retried else "retry_exhausted", "sent_at": None,
             "retryable": not notifications_retried},
        ]
        route.fulfill(json=[row for row in rows if row["order_id"] in req.post_data_json["p_order_ids"]])
    elif REFERENCES and path == "/rest/v1/rpc/admin_retry_order_status_email":
        assert req.headers.get("authorization") == f"Bearer {token}"
        notifications_retried.append(req.post_data_json["p_id"])
        route.fulfill(status=204)
    elif DASHBOARD and path == "/rest/v1/rpc/admin_dashboard_analytics":
        request_data = req.post_data_json
        assert req.headers.get("authorization") == f"Bearer {token}"
        assert request_data["p_low_stock_threshold"] == 3
        period = request_data["p_period"]
        dashboard_requests.append(period)
        if dashboard_state == "error":
            return route.fulfill(status=500, json={"message": "Synthetic error"})
        result = DASHBOARD[period]
        if dashboard_state == "empty":
            result = {**result, **{key: [] for key in ("recent", "bestsellers", "sizes", "editions", "quiet")},
                      "orders": {}, "payments": {}, "bank_review": 0,
                      "current": {**dict.fromkeys(result["current"], 0), "aov": None},
                      "trend": [{**point, "revenue": 0, "placed": 0} for point in result["trend"]],
                      "stock": {"threshold": 3, "products": 0, "low": 0, "out": 0, "alerts": []}}
        route.fulfill(json=result)
    elif REFERENCES and path == "/rest/v1/inventory_movements":
        route.fulfill(json=[{
            "id": row["order_id"], "product_id": "test-product", "product_name": "Test product",
            "size": "M", "change_type": "sale", "quantity_change": -1, "resulting_stock": 7,
            "reason": row["order_reference"], "created_at": "2026-11-14T00:00:00Z",
        } for row in REFERENCES.values()])
    elif REFERENCES and path == "/rest/v1/orders":
        query = parse_qs(url.query).get("or", [""])[0]
        orders = [{
            **row, "id": row["order_id"], "status": "delivered" if row == REFERENCES["current"] else "packed",
            "created_at": "2026-11-14T00:00:00Z",
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
            if row is None or details["email"] != "shopper@example.invalid":
                return route.fulfill(json=None)
            result = {**row, "status": "pending", "created_at": "2026-11-14T00:00:00Z", "items": []}
            if row is REFERENCES["current"]:
                result.update(status="shipped", courier_name=None, tracking_number=None, tracking_url=None)
            elif row is REFERENCES.get("uuid"):
                result.update(status="shipped", courier_name="QA Courier", tracking_number="QA-123",
                              tracking_url="https://courier.example.invalid/track/QA-123")
            return route.fulfill(json=result)
        order_attempts.append(payload)
        assert set(payload) == {"action", "input", "requestId", "token"}
        assert "conversionSession" not in payload["input"]
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
        confirmation_requests.append(req.post_data_json)
        route.fulfill(json={})
    else:
        route.fulfill(json=[])


def setup(context):
    if BUILD_DIR:
        # Serve the production build through Playwright when loopback HTTP or
        # the catalog required by the Vite SEO middleware is unavailable.
        def serve_build(route):
            relative_path = unquote(urlsplit(route.request.url).path).lstrip("/")
            asset = (BUILD_DIR / relative_path).resolve()
            if asset.is_relative_to(BUILD_DIR) and asset.is_file():
                route.fulfill(path=asset)
            elif route.request.resource_type == "document":
                route.fulfill(path=BUILD_DIR / "app.html")
            else:
                route.abort()

        context.route("**/*", lambda route: route.abort())
        context.route(f"{BASE_URL}/**", serve_build)
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


def check_dashboard(browser):
    global dashboard_state
    context = browser.new_context(viewport={"width": 1440, "height": 960}, timezone_id="America/New_York")
    setup(context)
    context.add_init_script(f"localStorage.setItem('comicculture-admin-auth', {json.dumps(json.dumps(session))});")
    page = context.new_page()
    page_errors = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    dashboard_url = f"{BASE_URL}/admin?section=dashboard"
    page.goto(dashboard_url)
    metrics = page.get_by_role("region", name="Key metrics")
    expect(metrics).to_be_visible()
    period_buttons = page.get_by_role("group", name="Reporting period")

    def verify_period(label, key):
        button = period_buttons.get_by_role("button", name=label, exact=True)
        button.click()
        expect(button).to_have_attribute("aria-pressed", "true")
        expected = DASHBOARD[key]["current"]["revenue"]
        expect(metrics.get_by_text(f"Rs. {expected:,}", exact=True).first).to_be_visible()
        assert dashboard_requests[-1] == key
        assert_layout(page)

    expect(period_buttons.get_by_role("button", name="Last 30 days")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_text(re.compile("Asia/Colombo"))).to_be_visible()
    expect(page.get_by_text("No previous baseline", exact=True)).to_have_count(0)
    assert dashboard_requests[-1] == "30d"
    for label, key in (("Today", "today"), ("Last 7 days", "7d"), ("Last 90 days", "90d"), ("All time", "all"), ("Last 30 days", "30d")):
        verify_period(label, key)
    expect(page.get_by_text(re.compile("at the same cutoff"))).to_be_visible()

    chart = page.get_by_role("group", name="Chart measure")
    chart.get_by_role("button", name="Orders").click()
    # The chart has a single tab stop and arrow keys move focus between periods.
    focusable_bar = page.locator("button[tabindex='0'][aria-label*=', ']")
    expect(focusable_bar).to_have_count(1)
    label = focusable_bar.get_attribute("aria-label")
    focusable_bar.press("Home")
    assert focusable_bar.get_attribute("aria-label") != label
    chart.get_by_role("button", name="Revenue").click()
    page.get_by_role("button", name="Show top 10").click()
    expect(page.get_by_role("button", name="Show top 5")).to_be_visible()
    page.get_by_role("button", name="Show top 5").click()
    page.get_by_text("Payment status breakdown").click()
    expect(page.get_by_text("Awaiting Verification", exact=True)).to_be_visible()
    page.get_by_text("Payment status breakdown").click()

    demand = page.get_by_role("group", name="Demand detail")
    demand.get_by_role("button", name="Edition sizes").click()
    expect(page.get_by_text("Cotton · L", exact=True).first).to_be_visible()
    categories = page.get_by_role("group", name="Demand category")
    categories.get_by_role("button", name=re.compile("New listings")).click()
    expect(page.get_by_text("Midnight Archive", exact=True)).to_be_visible()
    demand.get_by_role("button", name="Designs").click()
    categories.get_by_role("button", name=re.compile("Zero orders")).click()
    expect(page.get_by_text("Spider-Verse", exact=True)).to_be_visible()

    for width in (390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 960})
        assert_layout(page)
        if DASHBOARD_SCREENSHOTS:
            target = Path(DASHBOARD_SCREENSHOTS)
            target.mkdir(parents=True, exist_ok=True)
            page.evaluate("document.fonts.ready")
            page.evaluate("document.activeElement.blur(); window.scrollTo(0,0);")
            page.screenshot(path=target / f"dashboard-{width}.png", full_page=True, animations="disabled")

    dashboard_state = "error"
    page.get_by_role("button", name="Refresh", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("last successful results")
    expect(metrics).to_be_visible()
    period_buttons.get_by_role("button", name="Today", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("Could not load dashboard data")
    expect(metrics).to_have_count(0)
    dashboard_state = "empty"
    page.get_by_role("button", name="Retry", exact=True).click()
    expect(page.get_by_text("No orders placed in this period.")).to_be_visible()
    expect(page.get_by_text("No eligible item sales in this period.")).to_be_visible()
    expect(page.get_by_text("No sizes need restocking.")).to_be_visible()
    dashboard_state = "normal"
    page.get_by_role("button", name="Manage inventory").first.click()
    expect(page).to_have_url(re.compile("section=inventory$"))
    page.goto(dashboard_url)
    page.get_by_role("button", name="Manage orders").click()
    expect(page).to_have_url(re.compile("section=orders$"))
    assert not page_errors, page_errors
    context.close()


def check_status_email_admin(browser):
    global admin_role
    admin_role = "admin"
    context = browser.new_context(viewport={"width": 1440, "height": 960}, timezone_id="America/New_York")
    setup(context)
    context.add_init_script(f"localStorage.setItem('comicculture-admin-auth', {json.dumps(json.dumps(session))});")
    page = context.new_page()
    output = Path(FEATURE_SCREENSHOTS) if FEATURE_SCREENSHOTS else None
    if output:
        output.mkdir(parents=True, exist_ok=True)

    page.goto(f"{BASE_URL}/admin?section=orders")
    page.get_by_text("Search and payment/date filters", exact=False).click()
    search = page.get_by_placeholder("Order, customer, phone, email, tracking")
    search.fill(REFERENCES["historical"]["order_reference"])
    expect(page.get_by_text(REFERENCES["current"]["order_reference"], exact=True)).to_have_count(0)
    expect(page.get_by_role("button", name="View Details", exact=True)).to_have_count(1)
    page.get_by_role("button", name="View Details", exact=True).click()
    emails = page.get_by_role("region", name="Customer status emails")
    expect(emails.get_by_text("Pending", exact=True)).to_be_visible()
    for width in (390, 1440):
        page.set_viewport_size({"width": width, "height": 960})
        if output:
            emails.screenshot(path=output / f"status-email-pending-{width}.png", animations="disabled")
    search.fill(REFERENCES["current"]["order_reference"])
    expect(page.get_by_text(REFERENCES["current"]["order_reference"], exact=True)).to_be_visible()
    expect(page.get_by_text(REFERENCES["historical"]["order_reference"], exact=True)).to_have_count(0)
    expect(page.get_by_role("button", name="View Details", exact=True)).to_have_count(1)
    page.get_by_role("button", name="View Details", exact=True).click()
    emails = page.get_by_role("region", name="Customer status emails")
    for state in ("Sent", "Failed", "Skipped"):
        expect(emails.get_by_text(state, exact=True)).to_be_visible()
    for width in (390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 960})
        assert_layout(page)
        if output:
            emails.screenshot(path=output / f"status-emails-{width}.png", animations="disabled")
    emails.get_by_role("button", name="Retry delivered email").click()
    expect(emails.get_by_role("button", name="Retry delivered email")).to_have_count(0)
    assert notifications_retried == ["failed-qa"]
    context.close()


def check_privacy_first_storefront(browser):
    output = Path(PRIVACY_SCREENSHOTS) if PRIVACY_SCREENSHOTS else None
    if output:
        output.mkdir(parents=True, exist_ok=True)
    context = browser.new_context(reduced_motion="reduce")
    setup(context)
    context.add_init_script(f"""
        if (!sessionStorage.getItem('legacy-fixture')) {{
            localStorage.setItem({json.dumps(CONSENT_KEY)}, 'on');
            localStorage.setItem({json.dumps(VISIT_KEY)}, '{{"id":"retired-test-session"}}');
            sessionStorage.setItem('legacy-fixture', 'seeded');
        }}
    """)
    page = context.new_page()
    console_errors = []
    page.on("pageerror", lambda error: console_errors.append(str(error)))

    def check_page(name, width):
        expect(page.get_by_role("region", name="Your privacy, your choice")).to_have_count(0)
        expect(page.get_by_text("Allow analytics", exact=True)).to_have_count(0)
        expect(page.get_by_role("link", name="Privacy preferences")).to_have_count(0)
        assert page.evaluate("(keys) => keys.every(key => localStorage.getItem(key) === null)", [CONSENT_KEY, VISIT_KEY])
        assert_layout(page)
        if output:
            page.evaluate("document.fonts.ready")
            page.screenshot(path=output / f"{name}-{width}.png", animations="disabled")

    for width, height in ((320, 640), (375, 710), (390, 844), (768, 900), (1440, 900)):
        page.set_viewport_size({"width": width, "height": height})
        page.goto(f"{BASE_URL}/")
        expect(page.get_by_role("heading", name="Wear your universe.")).to_be_visible()
        check_page("home", width)
        if width == 390:
            page.get_by_role("button", name="Toggle menu").click()
            expect(page.get_by_role("dialog", name="Navigation")).to_be_visible()
            page.get_by_role("button", name="Close menu").click()
        page.get_by_role("link", name="Browse all designs").click()
        expect(page.get_by_role("heading", name="Shop All", exact=True)).to_be_visible()
        design = page.locator('a[href="/product/test-product"]').first
        expect(design).to_be_visible()
        check_page("shop", width)
        design.click()
        expect(page.get_by_role("heading", name=PRODUCT["name"], exact=True)).to_be_visible()
        check_page("product", width)
        if width == 320:
            page.get_by_role("button", name="M", exact=True).click()
            page.get_by_role("button", name="Add to Cart", exact=True).click()
            expect(page.get_by_role("dialog", name="Your cart")).to_be_visible()
            page.reload()
        page.get_by_role("button", name="Open cart").click()
        cart = page.get_by_role("dialog", name="Your cart")
        expect(cart.get_by_text(PRODUCT["name"], exact=False).first).to_be_visible()
        check_page("cart", width)
        cart.get_by_role("link", name="Proceed to Checkout").click()
        expect(page.get_by_role("heading", name="Checkout", exact=True)).to_be_visible()
        check_page("checkout", width)
        page.get_by_role("contentinfo").get_by_role("link", name="Privacy policy", exact=True).click()
        expect(page.get_by_role("heading", name="Privacy policy", exact=True)).to_be_visible()
        expect(page.get_by_role("heading", name="Browser storage and security tools")).to_be_visible()
        expect(page.get_by_label("Allow checkout analytics")).to_have_count(0)
        check_page("privacy", width)

    page.goto(f"{BASE_URL}/checkout")
    fill_checkout(page)
    page.get_by_role("button", name="Place Order", exact=True).click()
    expect(page).to_have_url(f"{BASE_URL}/order-success")
    expect(page.get_by_role("region", name="Your privacy, your choice")).to_have_count(0)
    assert not console_errors, console_errors
    context.close()


def check_admin_auth_and_retired_url(browser):
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    setup(context)
    page = context.new_page()
    page.goto(f"{BASE_URL}/admin?section=conversion")
    expect(page.get_by_role("heading", name="Admin sign in")).to_be_visible()
    aal1 = f"{segment({'alg': 'HS256'})}.{segment({'sub': user['id'], 'aal': 'aal1', 'exp': expires})}.dGVzdA"
    page.evaluate("(value) => localStorage.setItem('comicculture-admin-auth', JSON.stringify(value))", {**session, "access_token": aal1})
    page.reload()
    expect(page.get_by_role("heading", name="Two-step verification")).to_be_visible()
    expect(page.get_by_label("Authenticator code")).to_be_visible()
    expect(page.get_by_role("region", name="Key metrics")).to_have_count(0)
    page.evaluate("(value) => localStorage.setItem('comicculture-admin-auth', JSON.stringify(value))", session)
    page.reload()
    sections = page.get_by_role("navigation", name="Admin sections")
    expect(sections.get_by_role("button", name="conversion", exact=True)).to_have_count(0)
    expect(page.locator("option[value=conversion]")).to_have_count(0)
    expect(sections.get_by_role("button", name="orders", exact=True)).to_have_attribute("aria-current", "page")
    if DASHBOARD:
        sections.get_by_role("button", name="dashboard", exact=True).click()
        expect(page.get_by_role("region", name="Key metrics")).to_be_visible()
    context.close()


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
        uuid_reference = REFERENCES.get("uuid", REFERENCES["historical"])["order_reference"]
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
            for reference in dict.fromkeys((historical, uuid_reference, current)):
                ref.fill(reference)
                checkout.get_by_label("Email Address", exact=True).fill("shopper@example.invalid")
                checkout.get_by_role("button", name="Track Order", exact=True).click()
                expect(checkout.get_by_text(reference, exact=True)).to_be_visible()
                if reference == current:
                    expect(checkout.locator('[aria-current="step"]')).to_have_text("Shipped")
                    expect(checkout.get_by_text("Delivery tracking", exact=True)).to_have_count(0)
                elif "uuid" in REFERENCES and reference == uuid_reference:
                    expect(checkout.locator('[aria-current="step"]')).to_have_text("Shipped")
                    expect(checkout.get_by_text("Tracking number: QA-123", exact=True)).to_be_visible()
                    expect(checkout.get_by_role("link", name="Track with the courier")).to_have_attribute(
                        "href", "https://courier.example.invalid/track/QA-123")
                assert_layout(checkout)
            checkout.get_by_label("Email Address", exact=True).fill("limited@example.invalid")
            checkout.get_by_role("button", name="Track Order", exact=True).click()
            expect(checkout.get_by_role("alert")).to_contain_text("Too many tracking attempts")
            checkout.go_back()
            admin.goto(f"{BASE_URL}/admin?section=orders")
            admin.get_by_text("Search and payment/date filters", exact=False).click()
            search = admin.get_by_placeholder("Order, customer, phone, email, tracking")
            for reference, other in ((historical, current), (uuid_reference, current), (current, historical)):
                search.fill(reference)
                expect(admin.get_by_text(reference, exact=True)).to_be_visible()
                expect(admin.get_by_text(other, exact=True)).to_have_count(0)
                assert_layout(admin)
            admin.get_by_role("button", name="View Details", exact=True).click()
            expect(admin.get_by_text("Courier tracking (optional)", exact=True)).to_be_visible()
            expect(admin.get_by_text("Save the courier name and tracking number", exact=False)).to_have_count(0)
            whatsapp = admin.locator("a[href*='wa.me']").first
            expect(whatsapp).to_have_attribute("href", re.compile(re.escape(current)))
            admin.get_by_role("button", name="Print packing slip").click()
            expect(admin.get_by_role("heading", name=current, exact=True)).to_be_visible()
            assert_layout(admin)
            admin.emulate_media(media="print")
            assert_layout(admin)
            admin.emulate_media(media="screen")
        admin.goto(f"{BASE_URL}/admin?section=history")
        for reference in dict.fromkeys((historical, uuid_reference, current)):
            expect(admin.get_by_text(re.compile(re.escape(reference))).first).to_be_visible()
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
    if DASHBOARD:
        check_dashboard(browser)
        print("PASS: dashboard periods, comparison, chart keyboard controls, demand filters, navigation, refresh/error/empty states, and 390/768/1440px layouts.")
    if REFERENCES:
        check_status_email_admin(browser)
        print("PASS: admin status email display and retry.")
    check_privacy_first_storefront(browser)
    check_admin_auth_and_retired_url(browser)
    print("PASS: storefront, cart persistence, checkout, policy and footer at 320/375/390/768/1440px, admin MFA and retired URL, and zero conversion requests.")
    assert not unexpected, unexpected
    assert len(confirmation_requests) == 3
    assert all(payload == {
        "orderId": "00000000-0000-0000-0000-000000000009",
        "notificationToken": "synthetic-notification-token",
    } for payload in confirmation_requests)
    print("PASS: COD and bank-transfer checkout, receipt uploads, pricing retry with the same request ID, and confirmation requests.")
    if REFERENCES:
        print("PASS: reference confirmation, tracking, admin search, history, WhatsApp, packing slips and email HTML.")
    browser.close()

print("PASS: desktop/mobile settings and checkout, phone typing/paste/format validation, COD quote confirmation, and Bank Transfer receipt reset (mocked backend).")
