# Restaurant and jewellery commerce MVP

This release adds two category-specific commerce flows while keeping B Socio AR's approval and publishing controls intact.

## Restaurant table ordering

1. Set the business category to **Restaurant**, **Cafe**, **Food**, or **Bakery**.
2. Open **Restaurant > Settings** and enter the business-owned WhatsApp number, charges, currency, and order instructions.
3. Open **Restaurant > Tables**, create each physical table, and download its PNG or SVG QR.
4. Open **Restaurant > Menu** and configure prices, availability, ingredients, allergens, dietary tags, and spice level.
5. Scan a table QR on a phone. The server creates an opaque four-hour dining session and opens the public menu.
6. Add products, notes, and quantities, then review the cart before opening WhatsApp.

The table identity is taken from the server-validated dining session. Changing a `table` query parameter cannot move a cart or order to another table. WhatsApp messages are marked as **order requests initiated in WhatsApp**; they are not treated as confirmed or paid sales.

Existing printed table QRs remain valid when the table name or destination changes because the stable QR code resolves the current server-side destination.

## Jewellery enquiries

1. Set the business category to **Jewellery** or **Jewelry**.
2. Open **Jewellery > Settings** and enter the business-owned WhatsApp number, currency, and enquiry instructions.
3. Publish a product and use its product QR. Jewellery product QRs open the virtual try-on page.
4. Customers can choose an enquiry type, hand, finger, variant, size, and preferred appointment time before opening WhatsApp.

Try-on screenshots remain on the customer's device. They may be downloaded, shared, retaken, or deleted, but they are not uploaded to B Socio AR and cannot be attached to WhatsApp automatically. The interface tells the customer to attach a saved screenshot manually.

## Security and data boundaries

- Business WhatsApp numbers come from authenticated server-side settings, never from customer input.
- WhatsApp numbers are normalized and restricted to international digits.
- Dining tokens are random, stored only as SHA-256 hashes, placed in `HttpOnly` cookies, and expire after four hours.
- Restaurant carts are stored server-side and tied to the validated business, table, and dining session.
- Public product and table QR routes validate active, published records before redirecting.
- Enquiries and order requests are tracked as initiated activity, not completed sales.
- Source images and draft models continue to use the private R2 bucket; only approved AR assets may use the public bucket.

## Production setup

No new provider credentials are required for these commerce features. They use the existing:

- `MONGODB_URI`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`

Before accepting public traffic, create the new MongoDB indexes from a secure environment:

```powershell
pnpm db:indexes
```

Also confirm the existing R2 and SMTP variables described in `.env.example`. SMTP remains required for customer email verification.
