import base64
import json
import os
import re
import sys
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
CONVERSION_FIXTURE = os.environ.get("COMICCULTURE_CONVERSION_FIXTURE")
CONVERSION = json.loads(Path(CONVERSION_FIXTURE).read_text()) if CONVERSION_FIXTURE else None
FEATURE_SCREENSHOTS = os.environ.get("COMICCULTURE_FEATURE_SCREENSHOTS")
CONSENT_SCREENSHOTS = os.environ.get("COMICCULTURE_CONSENT_SCREENSHOTS")
CONSENT_ONLY = "--consent-only" in sys.argv
BUILD_DIR = Path(os.environ["COMICCULTURE_BROWSER_BUILD"]).resolve() if os.environ.get("COMICCULTURE_BROWSER_BUILD") else None
CONSENT_KEY = "comicculture-conversion-choice"
VISIT_KEY = "comicculture-conversion-session"
PRODUCT = {
    "id": "test-product", "slug": "test-product", "name": "Conversion test design", "product_code": "QA-DESIGN",
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
analytics_events = []
analytics_down = False
conversion_report_down = False
notifications_retried = []


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
    elif path == "/rest/v1/products":
        route.fulfill(json=[PRODUCT])
    elif CONVERSION and path == "/rest/v1/rpc/admin_checkout_conversion":
        if conversion_report_down:
            return route.fulfill(status=500, json={"message": "Synthetic report outage"})
        route.fulfill(json=CONVERSION[req.post_data_json["p_period"]])
    elif CONVERSION and REFERENCES and path == "/rest/v1/rpc/admin_order_status_emails":
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
    elif CONVERSION and path == "/rest/v1/rpc/admin_retry_order_status_email":
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
            **row, "id": row["order_id"], "status": ("delivered" if row == REFERENCES["current"] else "packed") if CONVERSION else "pending",
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
        if payload["action"] == "analytics":
            analytics_events.append(payload["input"])
            if analytics_down:
                return route.fulfill(status=503, json={"message": "Synthetic analytics outage"})
            return route.fulfill(status=204)
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


def check_checkout_conversion(browser):
    global admin_role, analytics_down, conversion_report_down
    admin_role = "admin"
    context = browser.new_context(viewport={"width": 1440, "height": 960}, timezone_id="America/New_York")
    setup(context)
    context.add_init_script(f"localStorage.setItem('comicculture-admin-auth', {json.dumps(json.dumps(session))});")
    page = context.new_page()
    page.goto(f"{BASE_URL}/admin?section=conversion")
    funnel = page.get_by_role("heading", name="Conversion funnel")
    expect(funnel).to_be_visible()
    expect(page.get_by_role("heading", name="Checkout conversion", exact=True)).to_be_visible()
    expect(page.get_by_text("Attributed orders", exact=True)).to_be_visible()
    expect(page.get_by_text("Mobile-size", exact=True)).to_be_visible()
    expect(page.get_by_text("Desktop-size", exact=True)).to_be_visible()
    period = page.get_by_role("group", name="Conversion period")
    for label in ("Today", "Last 7 days", "Last 90 days", "All retained", "Last 30 days"):
        period.get_by_role("button", name=label, exact=True).click()
        expect(period.get_by_role("button", name=label, exact=True)).to_have_attribute("aria-pressed", "true")
        expect(page.get_by_text(re.compile(r"Asia/Colombo"))).to_be_visible()

    saved = CONVERSION["today"]
    CONVERSION["today"] = {**saved, "viewed": 0, "added": 0, "started": 0, "purchased": 0, "products": []}
    period.get_by_role("button", name="Today", exact=True).click()
    expect(page.get_by_text("No tracked product views", exact=True)).to_be_visible()
    CONVERSION["today"] = saved
    conversion_report_down = True
    page.get_by_role("button", name="Refresh", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("Could not load")
    conversion_report_down = False
    page.get_by_role("button", name="Try again").click()
    expect(funnel).to_be_visible()
    period.get_by_role("button", name="Last 30 days", exact=True).click()
    expect(funnel).to_be_visible()
    output = Path(FEATURE_SCREENSHOTS) if FEATURE_SCREENSHOTS else None
    if output:
        output.mkdir(parents=True, exist_ok=True)
    for width in (390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 960})
        assert_layout(page)
        if output:
            page.evaluate("document.fonts.ready")
            page.screenshot(path=output / f"conversion-{width}.png", full_page=True, animations="disabled")

    if REFERENCES:
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

    admin_role = "staff"
    page.goto(f"{BASE_URL}/admin?section=conversion")
    expect(page.get_by_role("button", name="conversion", exact=True)).to_have_count(0)
    expect(page.get_by_role("heading", name="Checkout conversion", exact=True)).to_have_count(0)
    context.close()
    admin_role = "admin"

    shopper = browser.new_context(viewport={"width": 390, "height": 900})
    setup(shopper)
    page = shopper.new_page()

    def open_design():
        page.get_by_role("link", name=re.compile("Back to shop")).click()
        page.locator('a[href="/product/test-product"]').first.click()
        expect(page.get_by_role("heading", name="Conversion test design", exact=True)).to_be_visible()

    page.goto(f"{BASE_URL}/privacy-policy")
    choice = page.get_by_label("Allow checkout analytics")
    expect(choice).not_to_be_checked()
    open_design()
    assert not analytics_events
    page.goto(f"{BASE_URL}/privacy-policy")
    choice.check()
    open_design()
    page.get_by_role("button", name="M", exact=True).click()
    page.get_by_role("button", name="Add to Cart", exact=True).click()
    page.get_by_role("dialog", name="Your cart").get_by_role("link", name="Proceed to Checkout").click()
    expect(page.get_by_role("heading", name="Checkout", exact=True)).to_be_visible()
    expect(page.get_by_text("Payment method", exact=True)).to_be_visible()
    # A real opt-in journey produces all three browser stages. The order is
    # attributed by the server wrapper, never by a browser purchase event.
    page.wait_for_function(
        "() => JSON.parse(localStorage.getItem('comicculture-conversion-session') || 'null')?.id",
    )
    fill_checkout(page)
    expect(page.get_by_role("button", name="Place Order", exact=True)).to_be_enabled()
    assert [event["stage"] for event in analytics_events] == ["view", "cart", "checkout"]
    visit = analytics_events[0]["sessionId"]
    assert all(event["sessionId"] == visit and event["device"] == "mobile" for event in analytics_events)
    assert set(analytics_events[0]) == {"stage", "device", "productId", "sessionId"}
    assert analytics_events[0]["productId"] == "test-product"
    page.get_by_role("button", name="Place Order", exact=True).click()
    expect(page).to_have_url(f"{BASE_URL}/order-success")
    assert order_attempts[-1]["conversionSession"] == visit
    assert "conversionSession" not in order_attempts[-1]["input"]
    assert not any(event["stage"] == "purchase" for event in analytics_events)

    page.goto(f"{BASE_URL}/privacy-policy")
    choice.uncheck()
    assert page.evaluate("localStorage.getItem('comicculture-conversion-session')") is None
    choice.check()
    analytics_down = True
    open_design()
    page.get_by_role("button", name="M", exact=True).click()
    page.get_by_role("button", name="Add to Cart", exact=True).click()
    page.get_by_role("dialog", name="Your cart").get_by_role("link", name="Proceed to Checkout").click()
    fill_checkout(page)
    page.get_by_role("button", name="Place Order", exact=True).click()
    expect(page).to_have_url(f"{BASE_URL}/order-success")
    analytics_down = False
    shopper.close()


def check_privacy_consent(browser):
    global analytics_down
    output = Path(CONSENT_SCREENSHOTS) if CONSENT_SCREENSHOTS else None
    if output:
        output.mkdir(parents=True, exist_ok=True)
    heights = {320: 640, 375: 710, 390: 844, 768: 900, 1440: 900}
    events_before = len(analytics_events)
    shopper = browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
    setup(shopper)
    page = shopper.new_page()
    tab = shopper.new_page()
    banner = page.get_by_role("region", name="Your privacy, your choice")
    reject = banner.get_by_role("button", name="Only necessary")
    accept = banner.get_by_role("button", name="Allow analytics")
    choice = tab.get_by_label("Allow checkout analytics")

    page.goto(f"{BASE_URL}/")
    tab.goto(f"{BASE_URL}/privacy-policy")
    expect(choice).not_to_be_checked()
    expect(tab.get_by_role("region", name="Your privacy, your choice")).to_be_visible()
    for width, height in heights.items():
        page.set_viewport_size({"width": width, "height": height})
        expect(banner).to_be_in_viewport(ratio=1)
        assert_layout(page)
        box = banner.bounding_box()
        assert height - 24 <= box["y"] + box["height"] <= height
        for button in (reject, accept):
            expect(button).to_be_in_viewport(ratio=1)
            assert button.bounding_box()["height"] >= 44
        assert reject.get_attribute("class") == accept.get_attribute("class")
        if output and width in (390, 1440):
            page.evaluate("document.fonts.ready")
            page.screenshot(path=output / f"privacy-consent-{width}.png", animations="disabled")

    page.set_viewport_size({"width": 320, "height": 640})
    banner.get_by_role("link", name="Privacy policy").focus()
    page.keyboard.press("Tab")
    expect(reject).to_be_focused()
    page.keyboard.press("Tab")
    expect(accept).to_be_focused()
    assert page.evaluate("(key) => localStorage.getItem(key)", VISIT_KEY) is None
    assert len(analytics_events) == events_before
    page.keyboard.press("Enter")
    expect(banner).to_have_count(0)
    expect(choice).to_be_checked()
    expect(tab.get_by_role("region", name="Your privacy, your choice")).to_have_count(0)
    assert page.evaluate("(key) => localStorage.getItem(key)", CONSENT_KEY) == "on"
    page.reload()
    expect(page.get_by_role("link", name="Privacy preferences")).to_have_attribute("href", "/privacy-policy#analytics-choice")
    expect(banner).to_have_count(0)
    page.get_by_role("link", name="Privacy preferences").click()
    expect(page.get_by_role("region", name="Checkout analytics preference")).to_be_focused()
    expect(page.get_by_label("Allow checkout analytics")).to_be_checked()
    page.goto(f"{BASE_URL}/product/test-product")
    expect(page.get_by_role("heading", name=PRODUCT["name"], exact=True)).to_be_visible()
    page.wait_for_function("(key) => Boolean(localStorage.getItem(key))", arg=VISIT_KEY)
    choice.uncheck()
    expect(tab.get_by_text("Checkout analytics preference", exact=True)).to_be_visible()
    assert page.evaluate("(key) => localStorage.getItem(key)", VISIT_KEY) is None
    page.get_by_role("link", name="Privacy preferences").click()
    expect(page.get_by_label("Allow checkout analytics")).not_to_be_checked()
    expect(banner).to_have_count(0)
    shopper.close()

    declined = browser.new_context(viewport={"width": 320, "height": 640})
    setup(declined)
    page = declined.new_page()
    events_before = len(analytics_events)
    page.goto(f"{BASE_URL}/product/test-product")
    expect(page.get_by_role("heading", name=PRODUCT["name"], exact=True)).to_be_visible()
    banner = page.get_by_role("region", name="Your privacy, your choice")
    expect(banner).to_be_in_viewport(ratio=1)
    assert banner.evaluate("(el) => getComputedStyle(el.parentElement).position") == "static"
    page.get_by_role("button", name="M", exact=True).click()
    page.get_by_role("button", name="Add to Cart", exact=True).click()
    page.get_by_role("dialog", name="Your cart").get_by_role("link", name="Proceed to Checkout").click()
    expect(page.get_by_role("heading", name="Checkout", exact=True)).to_be_visible()
    expect(banner).to_be_visible()
    assert banner.evaluate("(el) => getComputedStyle(el.parentElement).position") == "static"
    if output:
        page.set_viewport_size({"width": 390, "height": 844})
        page.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })")
        expect(banner).to_be_in_viewport(ratio=1)
        page.evaluate("document.fonts.ready")
        page.screenshot(path=output / "privacy-consent-checkout-390.png", animations="disabled")
        page.set_viewport_size({"width": 320, "height": 640})
    fill_checkout(page)
    place_order = page.get_by_role("button", name="Place Order", exact=True)
    expect(place_order).to_be_enabled()
    place_order.scroll_into_view_if_needed()
    expect(place_order).to_be_in_viewport(ratio=1)
    assert_layout(page)
    place_order.click()
    expect(page).to_have_url(f"{BASE_URL}/order-success")
    assert "conversionSession" not in order_attempts[-1]
    banner.get_by_role("button", name="Only necessary").click()
    expect(banner).to_have_count(0)
    assert page.evaluate("(key) => localStorage.getItem(key)", CONSENT_KEY) == "off"
    assert page.evaluate("(key) => localStorage.getItem(key)", VISIT_KEY) is None
    page.reload()
    expect(banner).to_have_count(0)
    page.goto(f"{BASE_URL}/product/test-product")
    expect(page.get_by_role("heading", name=PRODUCT["name"], exact=True)).to_be_visible()
    assert page.evaluate("(key) => localStorage.getItem(key)", VISIT_KEY) is None
    page.goto(f"{BASE_URL}/privacy-policy")
    expect(page.get_by_label("Allow checkout analytics")).not_to_be_checked()
    expect(banner).to_have_count(0)
    assert len(analytics_events) == events_before
    declined.close()

    opted_in = browser.new_context(viewport={"width": 390, "height": 844})
    setup(opted_in)
    page = opted_in.new_page()
    events_before = len(analytics_events)
    analytics_down = True
    page.goto(f"{BASE_URL}/product/test-product")
    page.get_by_role("button", name="Allow analytics").click()
    page.get_by_role("button", name="M", exact=True).click()
    page.get_by_role("button", name="Add to Cart", exact=True).click()
    page.get_by_role("dialog", name="Your cart").get_by_role("link", name="Proceed to Checkout").click()
    fill_checkout(page)
    page.get_by_role("button", name="Place Order", exact=True).click()
    expect(page).to_have_url(f"{BASE_URL}/order-success")
    assert [event["stage"] for event in analytics_events[events_before:]] == ["view", "cart", "checkout"]
    assert order_attempts[-1]["conversionSession"] == analytics_events[events_before]["sessionId"]
    analytics_down = False
    opted_in.close()

    for signal, value in (("globalPrivacyControl", True), ("doNotTrack", "1"), ("doNotTrack", "yes")):
        protected = browser.new_context()
        setup(protected)
        protected.add_init_script(f"""
            Object.defineProperty(navigator, {json.dumps(signal)}, {{ value: {json.dumps(value)} }});
            localStorage.setItem({json.dumps(CONSENT_KEY)}, 'on');
        """)
        page = protected.new_page()
        events_before = len(analytics_events)
        page.goto(f"{BASE_URL}/product/test-product")
        expect(page.get_by_role("heading", name=PRODUCT["name"], exact=True)).to_be_visible()
        expect(page.get_by_role("region", name="Your privacy, your choice")).to_have_count(0)
        page.goto(f"{BASE_URL}/privacy-policy")
        choice = page.get_by_label("Allow checkout analytics")
        expect(choice).not_to_be_checked()
        expect(choice).to_be_disabled()
        assert page.evaluate("(key) => localStorage.getItem(key)", VISIT_KEY) is None
        assert len(analytics_events) == events_before
        protected.close()

    blocked = browser.new_context()
    setup(blocked)
    blocked.add_init_script(f"""
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {{
            if (key === {json.dumps(CONSENT_KEY)}) throw new DOMException('Blocked', 'SecurityError');
            return set.call(this, key, value);
        }};
    """)
    page = blocked.new_page()
    page.goto(f"{BASE_URL}/privacy-policy")
    page.get_by_role("button", name="Allow analytics").click()
    expect(page.get_by_label("Allow checkout analytics")).to_be_disabled()
    expect(page.get_by_role("region", name="Your privacy, your choice")).to_have_count(0)
    assert page.evaluate("(key) => localStorage.getItem(key)", VISIT_KEY) is None
    expect(page.get_by_text("Analytics is off because your browser could not store this preference.", exact=False)).to_be_visible()
    blocked.close()

    blocked = browser.new_context()
    setup(blocked)
    blocked.add_init_script("""
        Object.defineProperty(window, 'localStorage', {
            get() { throw new DOMException('Blocked', 'SecurityError'); },
        });
    """)
    page = blocked.new_page()
    page.goto(f"{BASE_URL}/privacy-policy")
    expect(page.get_by_label("Allow checkout analytics")).to_be_disabled()
    expect(page.get_by_role("region", name="Your privacy, your choice")).to_have_count(0)
    page.goto(f"{BASE_URL}/product/test-product")
    expect(page.get_by_role("heading", name=PRODUCT["name"], exact=True)).to_be_visible()
    blocked.close()

    admin = browser.new_context()
    setup(admin)
    admin.add_init_script(f"localStorage.setItem('comicculture-admin-auth', {json.dumps(json.dumps(session))});")
    page = admin.new_page()
    for route in ("/admin?section=settings", "/ADMIN?section=settings"):
        page.goto(f"{BASE_URL}{route}")
        expect(page.get_by_role("heading", name="Delivery settings")).to_be_visible()
        expect(page.get_by_role("region", name="Your privacy, your choice")).to_have_count(0)
    admin.close()
    assert not unexpected, unexpected
    print("PASS: privacy consent, persistence, cross-tab changes, withdrawal, privacy signals, blocked storage, checkout with no consent or analytics outage, admin isolation, and 320/375/390/768/1440px layouts.")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge")
    if CONSENT_ONLY:
        check_privacy_consent(browser)
        browser.close()
        sys.exit(0)
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
    if CONVERSION:
        check_checkout_conversion(browser)
        print("PASS: conversion filters, empty/error states, 390/768/1440px layouts, opt-in shopper events, checkout during analytics failure, and status email retry.")
    check_privacy_consent(browser)
    assert not unexpected, unexpected
    if REFERENCES:
        print("PASS: reference confirmation, tracking, admin search, history, WhatsApp, packing slips and email HTML.")
    browser.close()

print("PASS: desktop/mobile settings and checkout, phone typing/paste/format validation, COD quote confirmation, and Bank Transfer receipt reset (mocked backend).")
