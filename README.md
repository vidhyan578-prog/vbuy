# vBuy v2 – online shopping website

HTML + CSS + JavaScript + **jQuery (Ajax)**. Firebase is used only through REST calls made with `$.ajax()` (see `firebase.js`). No Firebase SDK, no frameworks.
jQuery is included in the folder (`jquery.min.js`), so no internet link is needed for it.

## Set up (about 10 minutes)
You only edit `config.js`. If you already have a working `config.js` from version 1, copy its `apiKey`, `projectId` and `databaseId` into this one.

1. **config.js** – paste your Web API Key (Firebase Console → gear icon → Project settings → General). Keep `projectId: "vbuy-shop-49e66"` and `databaseId: "(default)"`.
2. **Authentication** – Email/Password must be enabled.
3. **Firestore rules** – Firestore → Rules → delete all → paste `firestore.rules` → Publish. (These rules are new in v2. You must publish them again.)
4. **Make yourself admin** – Register on the site → Firebase Console → Authentication → copy your User UID → Firestore → collection `admins` → Document ID = your UID → field `role` (string) = `admin`.
5. Log in → **Admin** link → **Import 12 sample products** (one time; it also creates the 5 categories).
6. Open the folder in VS Code → right-click `index.html` → Open with Live Server.

## What is in it (from your notes)
**Customer:** sign up, sign in, **reset password** (Firebase sends the email), logout, search, category filter, pagination, product page, cart with quantities, checkout with **Cash or Credit limit**, **bill** (printable), order history, profile.
**Admin:**
- **Products (inventory):** Add / Read / Update / Delete. Read all, by category, by search or ID. Pagination. **Activate / Deactivate** (inactive products are hidden from the shop) and **Delete with confirmation**. The ID cannot be changed. Products are linked to a category by `catId`.
- **Categories:** add, edit name, delete (blocked while products use it).
- **Customers:** admin sets, changes or removes each customer's **credit limit** (default 0; the "Set 1000" button sets 1000).
- **Orders:** change status; mark a credit order as paid.
- **Reports** (CSV download too):
  - Customer: all customers, top 10 (dates), cash purchases (dates), credit purchases (dates).
  - Inventory: current stock (all), category wise, high stock (more than 100), low stock (less than 15).
  - Sales (dates): all, category wise, cash, credit, top 10 and bottom 10 selling items.

## Credit limit rules
- A new customer has limit 0, so the Credit option is disabled until the admin sets a limit.
- Available credit = limit − unpaid credit orders (cancelled orders do not count). When the admin ticks "Credit paid", the credit is free again.

## Order e-mails (optional, free with EmailJS)
Firebase cannot send order emails on the free plan, so this uses EmailJS. If you skip it, the site says honestly "Email is not set up".
1. Create a free account at emailjs.com → add an Email Service (e.g. Gmail) → note the **Service ID**.
2. Create an Email Template. Set "To email" to `{{to_email}}`. In the body you can use: `{{to_name}}`, `{{order_no}}`, `{{order_total}}`, `{{payment_method}}`, `{{order_items}}`, `{{address}}`. Note the **Template ID**.
3. Account → API keys → copy the **Public key**.
4. Paste the three values into `config.js` under `emailjs`.

## Database (Firestore)
| Collection | Document ID | Main fields |
|---|---|---|
| `categories` | slug (e.g. `books`) | name |
| `products` | auto / p1…p12 | name, catId, description, price, stock (qty), image, active |
| `customers` | user UID | fullName, email, mobile, address, creditLimit |
| `carts` | user UID | items [{id, qty}] |
| `orders` | auto | billNo, uid, email, customer{}, items[], subtotal, shipping, total, paymentMethod, creditSettled, status, createdAt |
| `admins` | admin UID | role |

## Security (what the rules do)
- Only users listed in `admins` can add/edit/delete products and categories, see all customers/orders, change order status and set credit limits. This is checked by Firestore, so changing the JavaScript in the browser cannot bypass it. The website itself can never write to `admins`.
- A customer can read/edit only their own profile and orders, and can **not** change their own credit limit (new customers must start at 0).
- A customer may only **lower** a product's stock number (this is how buying reduces stock). Nothing else on a product.
- A credit order is refused by Firestore if its total is more than the customer's credit limit.

## Tested and not tested
Tested in a real headless browser (Chromium) against a **simulated** Firebase server, 77 checks: everything above including credit limit, bill, reset-password request, stock reduction, all 14 reports, CSV download, pagination, mobile layout, dead links and console errors.
**Not tested with your real Firebase, your real EmailJS account or a real inbox.** I cannot check that the rules text behaves exactly like the real rules engine, or that the reset email arrives. Errors from Firebase are shown on screen in red.

## Known limits (need a server/backend to fix)
- Total of unpaid credit is checked in the browser. The rules only check each single order against the limit, so a skilled user could go over the limit with several orders.
- Prices and totals are calculated in the browser (the checkout re-reads current prices and stock from Firestore first).
- A customer could lower a product's stock number by hand (that is the price of letting buying update stock without a server).
- Product pictures are saved inside Firestore (small JPEG, about 600 px), because Firebase Storage needs the paid plan.
- Payment is Cash or Credit limit only. No online payment.
- Committing and pushing to your Azure Git repo is something you do yourself in VS Code.
