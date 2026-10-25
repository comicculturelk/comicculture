# Storefront launch checklist

The storefront uses existing catalog products, prices, stock and collection records.
No campaign service or additional database schema is required.

## Publish a design

1. Complete the product name, collection, description and garment version details in Admin.
2. Set accurate stock, SKU and price for each size. Do not use stock to simulate scarcity.
3. Add the garment's real size guide in inches. The storefront keeps original SKU sizes while displaying XXL as 2XL and XXXL as 3XL.
4. Upload front, back, detail and on-model images where available. Extra gallery images automatically become browsable on product cards. Do not reuse one garment's measurements or imagery for another garment.
5. If there are no published measurements yet, the fit-guide action offers WhatsApp help rather than invented measurements.
6. Verify the real product URL, both available and unavailable sizes, cart totals and checkout before sharing it.

## Feature a release

Edit the small `FEATURED_LAUNCH` record in `src/config/merchandising.ts`:

- `productSlug`: the real product to feature.
- `summary`: one factual benefit, matching the product.
- `detailImageIndex`, `detailLabel` and `detailCaption`: a real supplementary product image, description and short caption. The current slot demonstrates Iron Man's glow print. Replace these together when changing the launch; omit these fields if no detail image is suitable.

Price and availability come from the live catalog. An unavailable featured product is replaced by another available design. Other live collections remain accessible through the manual campaign controls. The featured product links directly to its product page.

The NEW badge expires after `NEW_PRODUCT_DAYS` (currently 30) from the existing product creation timestamp. This is an explicit display policy, not a claim about a separate launch date. An older featured item is labelled Featured design. If you create products well before launch, review the badge timing before publishing; no release-date field or migration was introduced.

## Maintain customer information

- Delivery fee and published timing text live in `src/config/store.ts`. The same fee is used in product pages, cart, delivery information and checkout.
- Do not change policy or promise a specific delivery date without confirming fulfilment arrangements. Preorder timing continues to use the selected version's existing settings.
- Collection names resolve by collection ID so renamed collections do not split storefront filtering. The saved order/SKU data is unchanged.
- Homepage reviews initially show two real, published reviews. Product reviews match the product name exactly; renaming a product may require updating its review label in Admin.
- Contact hours, model measurements, packaging/customer photos, restock dates and preorder promises must be supplied and verified. None have been invented.
- Coming-soon collections link to the existing Instagram account for updates. This does not collect customer data or create an email-alert subscription.

## Check a launch

- Open the home page at mobile and desktop widths; check the hero crop and detail caption.
- Click the launch CTA and product-card photo arrows.
- Confirm no size is preselected, and Choose your size moves focus to an available size.
- Check the size guide, actual price and delivery fee.
- Add a temporary cart line, check totals, and remove it after testing.
- Check COD and bank transfer instructions without creating a production test order.
- Run `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

## Measurement follow-up

No analytics provider or tracking endpoint was configured in this project. Before implementing analytics, choose the service and applicable consent settings. Useful aggregate events are launch impressions/clicks, product views, size selections, fit-guide use, add-to-cart, checkout start and completed orders. Avoid contact/payment data in events. Separate COD orders placed from later confirmed/delivered outcomes when evaluating results.

No support hours, additional photos, real customer messages, production orders or backend changes were required for the storefront implementation.
