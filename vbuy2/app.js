/* vBuy v2 - customer pages. jQuery for the page, jQuery $.ajax (in firebase.js) for Firebase. */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => CONFIG.currency + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const slug = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const mobileOk = m => /^\+?\d{10,13}$/.test(m);
const cleanMobile = m => String(m).replace(/[\s-]/g, "");
const STATUSES = ["Placed", "Processing", "Shipped", "Delivered", "Cancelled"];
const MAXQ = 10;

function toast(msg, type) {
  const t = $('<div class="toast"></div>').text(msg).toggleClass("err", type === "err");
  $("#toasts").append(t); setTimeout(() => t.remove(), 4500);
}
function setErr($f, errors) {
  $f.find(".err[data-for]").each(function () { $(this).text(errors[$(this).attr("data-for")] || ""); });
  return Object.keys(errors).length === 0;
}
function nextPage() { const n = new URLSearchParams(location.search).get("next"); return /^[a-z-]+\.html$/.test(n || "") ? n : "index.html"; }
function requireLogin() {
  if (FB.session()) return true;
  location.href = "login.html?next=" + location.pathname.split("/").pop(); return false;
}
const imgTag = (src, alt) => src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : `<img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='%23eee'/%3E%3C/svg%3E">`;

/* ---------- Cart: [{id, qty}] saved in the browser, and in Firestore when logged in ---------- */
const Cart = {
  get() { try { return JSON.parse(localStorage.getItem("vbuy_cart") || "[]"); } catch (e) { return []; } },
  set(items, sync = true) {
    localStorage.setItem("vbuy_cart", JSON.stringify(items)); this.badge();
    const s = FB.session();
    if (sync && s) FB.setDoc("carts", s.uid, { items, updatedAt: new Date() }).catch(() => {});
  },
  badge() { $("#cartCount").text(this.get().reduce((n, i) => n + i.qty, 0)); },
  add(p, qty) {
    const items = this.get(), f = items.find(i => i.id === p.id), cap = Math.min(MAXQ, p.stock);
    if (f) f.qty = Math.min(cap, f.qty + qty); else items.push({ id: p.id, qty: Math.min(cap, qty) });
    this.set(items);
  },
  setQty(id, q, cap) { this.set(this.get().map(i => i.id === id ? { id, qty: Math.max(1, Math.min(cap, q)) } : i)); },
  remove(id) { this.set(this.get().filter(i => i.id !== id)); },
  lines(products) {
    const m = new Map(products.map(p => [p.id, p]));
    return this.get().filter(i => m.has(i.id)).map(i => ({ ...m.get(i.id), qty: Math.min(i.qty, Math.max(1, Math.min(MAXQ, m.get(i.id).stock))) }));
  },
  totals(lines) {
    const subtotal = Math.round(lines.reduce((n, i) => n + i.price * i.qty, 0) * 100) / 100;
    const shipping = lines.length && subtotal < CONFIG.freeShippingOver ? CONFIG.shippingFee : 0;
    return { subtotal, shipping, total: Math.round((subtotal + shipping) * 100) / 100 };
  },
  async loadRemote() {
    try {
      const d = await FB.getDoc("carts", FB.session().uid);
      if (d && d.items && d.items.length) {
        const map = new Map(d.items.map(i => [i.id, { id: i.id, qty: i.qty }]));
        this.get().forEach(i => { const e = map.get(i.id); map.set(i.id, e ? { id: i.id, qty: Math.max(e.qty, i.qty) } : { id: i.id, qty: i.qty }); });
        this.set([...map.values()]);
      } else this.set(this.get());
    } catch (e) { /* cart still works in the browser */ }
  }
};

/* ---------- Catalog (shop only shows ACTIVE products) ---------- */
let _cat = null;
async function loadCatalog() {
  if (_cat) return _cat;
  let products = [], cats = [], sample = false, reason = "";
  try {
    if (!FB.configured()) throw new Error("Firebase Web API Key is not set in config.js");
    [products, cats] = await Promise.all([FB.listDocs("products"), FB.listDocs("categories")]);
  } catch (e) { reason = e.message; }
  if (!products.length) {
    try { products = await $.getJSON("products.json"); cats = await $.getJSON("categories.json"); sample = true; reason = reason || "No products saved in Firestore yet"; }
    catch (e) { products = []; }
  }
  const cm = {}; cats.forEach(c => cm[c.id] = c.name);
  products = products.filter(p => p.active !== false);
  products.forEach(p => p.category = cm[p.catId] || "Other");
  products.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return (_cat = { products, sample, reason });
}

/* ---------- Header / footer ---------- */
function renderChrome() {
  const s = FB.session(), q = new URLSearchParams(location.search).get("q") || "";
  $("#hdr").html(`<div class="top"><a class="logo" href="index.html">v<span>Buy</span></a>
  <form class="search" action="index.html"><input name="q" value="${esc(q)}" placeholder="Search vBuy" aria-label="Search products"><button aria-label="Search">🔍</button></form>
  <nav>${s ? `<span>Hello, ${esc(s.email.split("@")[0])}</span><a href="orders.html">Orders &amp; Profile</a><a id="adminLink" href="admin.html" hidden>Admin</a><a href="#" id="logout">Logout</a>`
    : `<a href="login.html">Sign in</a><a href="register.html">Register</a>`}<a class="cartlink" href="cart.html">🛒 <b id="cartCount">0</b></a></nav></div>`);
  $("#ftr").html(`<a href="index.html">Home</a> · <a href="cart.html">Cart</a> · <a href="orders.html">My orders</a><br>© vBuy – a practice shopping website`);
  Cart.badge();
  $("#logout").on("click", e => { e.preventDefault(); FB.signOut(); Cart.set([], false); location.href = "index.html"; });
  if (s) FB.isAdmin().then(ok => { if (ok) $("#adminLink").prop("hidden", false); });
}

/* ---------- Home ---------- */
async function pageHome() {
  const p = new URLSearchParams(location.search), q = (p.get("q") || "").trim().toLowerCase(), cat = p.get("cat") || "";
  let page = Math.max(1, parseInt(p.get("page")) || 1);
  const { products, sample, reason } = await loadCatalog();
  if (sample) $("#notice").html(`<div class="notice">Showing the built-in sample products (${esc(reason)}). Follow the README to connect Firestore; the admin can then import these products.</div>`);
  const cats = [...new Map(products.map(x => [x.catId, x.category])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const url = o => "index.html?" + new URLSearchParams(Object.fromEntries(Object.entries({ q: p.get("q") || "", cat, page: 1, ...o }).filter(([k, v]) => v && !(k === "page" && v === 1)))).toString();
  $("#cats").html(`<li><a class="${cat ? "" : "on"}" href="${url({ cat: "" })}">All products</a></li>` +
    cats.map(([id, name]) => `<li><a class="${id === cat ? "on" : ""}" href="${esc(url({ cat: id }))}">${esc(name)}</a></li>`).join(""));
  const list = products.filter(x => (!cat || x.catId === cat) && (!q || (x.name + " " + x.category + " " + x.description).toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(list.length / CONFIG.perPage));
  page = Math.min(page, pages);
  const show = list.slice((page - 1) * CONFIG.perPage, page * CONFIG.perPage);
  $("#info").text(`${list.length} result${list.length === 1 ? "" : "s"}` + (q ? ` for "${p.get("q")}"` : "") + (cat ? ` in ${(cats.find(c => c[0] === cat) || [0, cat])[1]}` : ""));
  $("#grid").html(show.length ? show.map(x => `<article class="pcard"><a href="product.html?id=${encodeURIComponent(x.id)}">${imgTag(x.image, x.name)}<h3>${esc(x.name)}</h3></a>
    <div class="cat">${esc(x.category)}</div><div class="price">${money(x.price)}</div>
    ${x.stock > 0 ? `<button class="btn add" data-id="${esc(x.id)}">Add to cart</button>` : `<span class="muted">Out of stock</span>`}</article>`).join("")
    : `<div class="card">No products found. <a href="index.html">Show all products</a></div>`);
  $("#grid").on("click", ".add", function () {
    const pr = products.find(x => x.id === $(this).attr("data-id")); Cart.add(pr, 1); toast(pr.name + " added to cart");
  });
  $("#pager").html(pages > 1 ? `<a class="${page === 1 ? "off" : ""}" href="${url({ page: page - 1 })}">« Prev</a>` +
    Array.from({ length: pages }, (_, i) => `<a class="${i + 1 === page ? "on" : ""}" href="${url({ page: i + 1 })}">${i + 1}</a>`).join("") +
    `<a class="${page === pages ? "off" : ""}" href="${url({ page: page + 1 })}">Next »</a>` : "");
}

/* ---------- Product details ---------- */
async function pageProduct() {
  const id = new URLSearchParams(location.search).get("id");
  const { products } = await loadCatalog(), p = products.find(x => x.id === id);
  if (!p) { $("#detail").html(`<div class="card">Product not found. <a href="index.html">Back to home</a></div>`); return; }
  document.title = p.name + " | vBuy";
  const max = Math.min(MAXQ, p.stock);
  $("#detail").html(`<div class="card detail"><div>${imgTag(p.image, p.name)}</div><div>
    <div class="cat"><a href="index.html?cat=${encodeURIComponent(p.catId)}">${esc(p.category)}</a></div><h1>${esc(p.name)}</h1>
    <div class="price">${money(p.price)}</div><p>${esc(p.description)}</p>
    ${max > 0 ? `<p class="free">In stock (${p.stock} available)</p><label>Quantity<select id="qty" style="width:90px">${Array.from({ length: max }, (_, i) => `<option>${i + 1}</option>`).join("")}</select></label>
    <div class="row" style="margin-top:14px"><button class="btn" id="addBtn">Add to cart</button><a class="btn buy" href="cart.html">Go to cart</a></div>`
      : `<p style="color:var(--red)">Currently out of stock</p>`}</div></div>`);
  $("#addBtn").on("click", () => { const q = parseInt($("#qty").val()); Cart.add(p, q); toast(`${q} × ${p.name} added to cart`); });
}

/* ---------- Cart ---------- */
async function pageCart() {
  const { products } = await loadCatalog(), $box = $("#cartBox");
  function draw() {
    const lines = Cart.lines(products);
    if (lines.length !== Cart.get().length) Cart.set(lines.map(l => ({ id: l.id, qty: l.qty })));
    if (!lines.length) { $box.html(`<div class="card">Your cart is empty. <a href="index.html">Continue shopping</a></div>`); return; }
    const t = Cart.totals(lines);
    $box.html(`<div class="two"><div class="card">${lines.map(i => `<div class="crow">${imgTag(i.image, i.name)}<div>
      <a href="product.html?id=${encodeURIComponent(i.id)}"><b>${esc(i.name)}</b></a><div class="price">${money(i.price)}</div>
      <button class="btn small danger" data-act="rm" data-id="${esc(i.id)}">Remove</button></div>
      <div class="ra"><div class="qty"><button data-act="dec" data-id="${esc(i.id)}" aria-label="Decrease">−</button><span>${i.qty}</span><button data-act="inc" data-id="${esc(i.id)}" aria-label="Increase">+</button></div>
      <div style="margin-top:6px;text-align:right"><b>${money(i.price * i.qty)}</b></div></div></div>`).join("")}</div>
      <div class="card totals"><h2>Order summary</h2><div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      <div><span>Delivery</span><span class="${t.shipping ? "" : "free"}">${t.shipping ? money(t.shipping) : "FREE"}</span></div>
      <div class="t"><span>Total</span><span>${money(t.total)}</span></div>
      <p class="muted">Free delivery on orders over ${money(CONFIG.freeShippingOver)}.</p>
      <a class="btn buy" style="width:100%" href="checkout.html">Proceed to checkout</a></div></div>`);
  }
  $box.on("click", "[data-act]", function () {
    const act = $(this).attr("data-act"), id = $(this).attr("data-id"), it = Cart.lines(products).find(i => i.id === id);
    const cap = Math.min(MAXQ, it.stock);
    if (act === "rm") Cart.remove(id); else Cart.setQty(id, it.qty + (act === "inc" ? 1 : -1), cap);
    draw();
  });
  draw();
}

/* ---------- Customer + credit helpers ---------- */
async function ensureCustomer(s, extra) {
  let c = await FB.getDoc("customers", s.uid);
  if (!c) { c = { fullName: (extra && extra.fullName) || "", email: s.email, mobile: (extra && extra.mobile) || "", address: "", creditLimit: 0, createdAt: new Date() }; await FB.setDoc("customers", s.uid, c); }
  return c;
}
const creditUsed = orders => orders.filter(o => o.paymentMethod === "Credit" && !o.creditSettled && o.status !== "Cancelled").reduce((n, o) => n + o.total, 0);
async function creditInfo(s) {
  const c = await ensureCustomer(s), used = creditUsed(await FB.queryEq("orders", "uid", s.uid)), limit = c.creditLimit || 0;
  return { customer: c, limit, used, available: Math.max(0, limit - used) };
}

/* ---------- Order e-mail (EmailJS, optional) ---------- */
async function sendOrderMail(o) {
  const m = CONFIG.emailjs || {};
  if (!m.serviceId || !m.templateId || !m.publicKey) return "not-configured";
  try {
    await $.ajax({ url: "https://api.emailjs.com/api/v1.0/email/send", type: "POST", contentType: "application/json", dataType: "text",
      data: JSON.stringify({ service_id: m.serviceId, template_id: m.templateId, user_id: m.publicKey, template_params: {
        to_email: o.email, to_name: o.customer.fullName, order_no: o.billNo, order_total: money(o.total), payment_method: o.paymentMethod,
        order_items: o.items.map(i => `${i.name} x ${i.qty} = ${money(i.price * i.qty)}`).join("\n"), address: o.customer.address } }) });
    return "sent";
  } catch (e) { return "failed"; }
}

/* ---------- Checkout ---------- */
async function pageCheckout() {
  if (!requireLogin()) return;
  const s = FB.session(), $f = $("#coForm"), { products } = await loadCatalog(), lines = Cart.lines(products);
  if (!lines.length) { $("main").html(`<div class="card">Your cart is empty. <a href="index.html">Continue shopping</a></div>`); return; }
  const t = Cart.totals(lines);
  $("#summary").html(`<h2>Your items</h2>${lines.map(i => `<div class="oitem">${imgTag(i.image, i.name)}<span>${esc(i.name)} × ${i.qty}</span><b style="margin-left:auto">${money(i.price * i.qty)}</b></div>`).join("")}
    <div class="totals" style="margin-top:10px"><div><span>Subtotal</span><span>${money(t.subtotal)}</span></div><div><span>Delivery</span><span>${t.shipping ? money(t.shipping) : "FREE"}</span></div><div class="t"><span>Total</span><span>${money(t.total)}</span></div></div>`);
  let ci = { available: 0, limit: 0, used: 0 };
  try {
    ci = await creditInfo(s); const c = ci.customer;
    $f.find("[name=fullName]").val(c.fullName || ""); $f.find("[name=mobile]").val(c.mobile || ""); $f.find("[name=address]").val(c.address || "");
    $("#creditInfo").text(ci.limit > 0 ? `(available ${money(ci.available)} of ${money(ci.limit)})` : "(your credit limit is ₹0 – ask the admin to set it)");
  } catch (e) { toast(e.message, "err"); }
  if (ci.available <= 0) $("#payCredit").prop("disabled", true);
  $f.on("submit", async e => {
    e.preventDefault();
    const d = { fullName: $f.find("[name=fullName]").val().trim(), mobile: cleanMobile($f.find("[name=mobile]").val()), address: $f.find("[name=address]").val().trim() }, er = {};
    const payment = $f.find("[name=payment]:checked").val();
    if (d.fullName.length < 2) er.fullName = "Please enter your full name.";
    if (!mobileOk(d.mobile)) er.mobile = "Enter a valid mobile number (10 to 13 digits).";
    if (d.address.length < 10) er.address = "Please enter your full delivery address (at least 10 characters).";
    if (payment === "Credit" && t.total > ci.available) er.payment = `Not enough credit. Available: ${money(ci.available)}, order total: ${money(t.total)}.`;
    if (!setErr($f, er)) return;
    const $b = $("#placeBtn").prop("disabled", true).text("Placing order...");
    try {
      // Re-check every product in Firestore: still active, enough stock, current price.
      const items = [];
      for (const l of lines) {
        const p = await FB.getDoc("products", l.id);
        if (!p || p.active === false) throw new Error(`"${l.name}" is not available in the store database. Remove it from the cart.`);
        if (p.stock < l.qty) throw new Error(`Only ${p.stock} of "${p.name}" left in stock.`);
        items.push({ id: p.id, name: p.name, price: p.price, qty: l.qty, catId: p.catId || "", stock: p.stock, image: p.image && !p.image.startsWith("data:") ? p.image : "" });
      }
      const tt = Cart.totals(items);
      if (payment === "Credit") { const c2 = await creditInfo(s); if (tt.total > c2.available) throw new Error(`Not enough credit. Available: ${money(c2.available)}.`); }
      const order = await FB.addDoc("orders", { uid: s.uid, email: s.email, billNo: "VB" + Date.now().toString().slice(-9), customer: d,
        items: items.map(({ stock, ...rest }) => rest), subtotal: tt.subtotal, shipping: tt.shipping, total: tt.total,
        paymentMethod: payment, creditSettled: false, status: "Placed", createdAt: new Date() });
      let warn = false;
      for (const i of items) { try { await FB.updateDoc("products", i.id, { stock: i.stock - i.qty }); } catch (x) { warn = true; } }
      await FB.updateDoc("customers", s.uid, d).catch(() => {});
      Cart.set([]);
      sessionStorage.setItem("vbuy_mail_" + order.id, await sendOrderMail(order));
      if (warn) sessionStorage.setItem("vbuy_stockwarn", "1");
      location.href = "order-confirmation.html?id=" + encodeURIComponent(order.id);
    } catch (err) { toast("Order failed: " + err.message, "err"); $b.prop("disabled", false).text("Place order"); }
  });
}

/* ---------- Orders (shared card) ---------- */
function orderCard(o, admin) {
  const c = o.customer || {}, no = o.billNo || o.id.slice(0, 8).toUpperCase(), pay = o.paymentMethod || "Cash";
  const ctl = admin
    ? `<select class="stSel" data-id="${esc(o.id)}" style="width:auto">${STATUSES.map(x => `<option ${x === o.status ? "selected" : ""}>${x}</option>`).join("")}</select>` +
      (pay === "Credit" ? ` <label class="inl"><input type="checkbox" class="creditChk" data-id="${esc(o.id)}" ${o.creditSettled ? "checked" : ""}> Credit paid</label>` : "")
    : `<span class="badge ${esc(o.status)}">${esc(o.status)}</span>`;
  return `<article class="card order"><div class="head"><div><b>Bill #${esc(no)}</b><div class="muted">${esc(new Date(o.createdAt).toLocaleString())}</div></div>
    <div>${ctl}</div><div><b>Total ${money(o.total)}</b><div class="muted">${esc(pay)}${pay === "Credit" ? (o.creditSettled ? " (paid)" : " (unpaid)") : ""}</div></div></div>
    ${(o.items || []).map(i => `<div class="oitem">${i.image ? imgTag(i.image, i.name) : ""}<span>${esc(i.name)} × ${i.qty}</span><span style="margin-left:auto">${money(i.price * i.qty)}</span></div>`).join("")}
    <p class="muted">Deliver to: ${esc(c.fullName)}, ${esc(c.mobile || c.phone)}<br>${esc(c.address)}${admin ? `<br>Account: ${esc(o.email)}` : ""}</p></article>`;
}
async function pageConfirm() {
  if (!requireLogin()) return;
  const id = new URLSearchParams(location.search).get("id"), $box = $("#conf");
  try {
    const o = id && await FB.getDoc("orders", id);
    if (!o) throw new Error("Order not found.");
    const mail = sessionStorage.getItem("vbuy_mail_" + id), c = o.customer || {};
    const mailTxt = { sent: `A confirmation email was sent to ${o.email}.`, failed: "The confirmation email could not be sent.", "not-configured": "Email is not set up (optional, see README), so no email was sent." }[mail] || "";
    $box.html(`<h1 style="color:var(--green)">✔ Order placed</h1><p>Thank you! Your order has been saved. ${esc(mailTxt)}</p>
      ${sessionStorage.getItem("vbuy_stockwarn") ? '<p class="err">Order saved, but stock numbers could not be updated.</p>' : ""}
      <div class="bill"><div class="head2"><div><b style="font-size:22px">v<span style="color:#e47911">Buy</span></b><br><span class="muted">Bill #${esc(o.billNo)}</span></div>
      <div class="muted" style="text-align:right">${esc(new Date(o.createdAt).toLocaleString())}<br>Status: ${esc(o.status)}<br>Payment: ${esc(o.paymentMethod)}</div></div>
      <p><b>${esc(c.fullName)}</b> · ${esc(c.mobile)}<br>${esc(c.address)}</p>
      <div class="tablewrap"><table><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th class="tot">Amount</th></tr></thead><tbody>
      ${o.items.map(i => `<tr><td>${esc(i.name)}</td><td>${money(i.price)}</td><td>${i.qty}</td><td class="tot">${money(i.price * i.qty)}</td></tr>`).join("")}</tbody></table></div>
      <div class="totals"><div><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div><span>Delivery</span><span>${o.shipping ? money(o.shipping) : "FREE"}</span></div><div class="t"><span>Total</span><span>${money(o.total)}</span></div></div></div>
      <div class="row noprint" style="margin-top:14px"><button class="btn buy" id="printBtn" type="button">Print bill</button><a class="btn" href="orders.html">My orders</a><a class="btn light" href="index.html">Continue shopping</a></div>`);
    $("#printBtn").on("click", () => window.print());
  } catch (e) { $box.html(`<p>${esc(e.message)}</p><a class="btn" href="orders.html">My orders</a>`); }
}
async function pageOrders() {
  if (!requireLogin()) return;
  const s = FB.session(), $f = $("#profForm");
  $("#ordersApp").prop("hidden", false); $f.find("[name=email]").val(s.email);
  try {
    const ci = await creditInfo(s), c = ci.customer;
    $f.find("[name=fullName]").val(c.fullName || ""); $f.find("[name=mobile]").val(c.mobile || ""); $f.find("[name=address]").val(c.address || "");
    $("#creditLine").text(`Credit limit: ${money(ci.limit)} · Unpaid credit: ${money(ci.used)} · Available: ${money(ci.available)}`);
  } catch (e) { toast(e.message, "err"); }
  $f.on("submit", async e => {
    e.preventDefault();
    const d = { fullName: $f.find("[name=fullName]").val().trim(), mobile: cleanMobile($f.find("[name=mobile]").val()), address: $f.find("[name=address]").val().trim() };
    if (d.fullName.length < 2) return $("#profErr").text("Please enter your full name.");
    if (d.mobile && !mobileOk(d.mobile)) return $("#profErr").text("Mobile number must have 10 to 13 digits.");
    $("#profErr").text("");
    try { await FB.updateDoc("customers", s.uid, d); toast("Profile saved"); } catch (err) { toast(err.message, "err"); }
  });
  try {
    const list = (await FB.queryEq("orders", "uid", s.uid)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $("#orderList").html(list.length ? list.map(o => orderCard(o, false)).join("") : `<div class="card">You have no orders yet. <a href="index.html">Start shopping</a></div>`);
  } catch (e) { $("#orderList").html(`<div class="card">Could not load orders: ${esc(e.message)}</div>`); }
}

/* ---------- Login / Register / Forgot password ---------- */
function pageLogin() {
  const $f = $("#loginForm");
  $f.on("submit", async e => {
    e.preventDefault();
    const email = $f.find("[name=email]").val().trim(), pw = $f.find("[name=password]").val(), $e = $("#formErr");
    if (!emailOk(email)) return $e.text("Please enter a valid email.");
    if (!pw) return $e.text("Please enter your password.");
    const $b = $f.find("button[type=submit]").prop("disabled", true); $e.text("");
    try { await FB.signIn(email, pw); await Cart.loadRemote(); location.href = nextPage(); }
    catch (err) { $e.text(err.message); $b.prop("disabled", false); }
  });
}
function pageRegister() {
  const $f = $("#regForm");
  $f.on("submit", async e => {
    e.preventDefault();
    const name = $f.find("[name=fullName]").val().trim(), email = $f.find("[name=email]").val().trim(), mobile = cleanMobile($f.find("[name=mobile]").val()),
      pw = $f.find("[name=password]").val(), $e = $("#formErr");
    if (name.length < 2) return $e.text("Please enter your full name.");
    if (!emailOk(email)) return $e.text("Please enter a valid email.");
    if (!mobileOk(mobile)) return $e.text("Enter a valid mobile number (10 to 13 digits).");
    if (pw.length < 6) return $e.text("Password must be at least 6 characters.");
    if (pw !== $f.find("[name=confirm]").val()) return $e.text("Passwords do not match.");
    const $b = $f.find("button[type=submit]").prop("disabled", true); $e.text("");
    try {
      const s = await FB.signUp(email, pw);
      await FB.setDoc("customers", s.uid, { fullName: name, email, mobile, address: "", creditLimit: 0, createdAt: new Date() });
      await Cart.loadRemote(); location.href = nextPage();
    } catch (err) { $e.text(err.message); $b.prop("disabled", false); }
  });
}
function pageForgot() {
  const $f = $("#forgotForm");
  $f.on("submit", async e => {
    e.preventDefault();
    const email = $f.find("[name=email]").val().trim(), $e = $("#formErr"), $o = $("#formOk");
    $o.text(""); if (!emailOk(email)) return $e.text("Please enter a valid email.");
    const $b = $f.find("button[type=submit]").prop("disabled", true); $e.text("");
    try { await FB.sendReset(email); $o.text("Done. Check your inbox (and spam folder) for the reset link."); }
    catch (err) { $e.text(err.message); }
    $b.prop("disabled", false);
  });
}

const PAGES = { home: pageHome, product: pageProduct, cart: pageCart, checkout: pageCheckout, login: pageLogin, register: pageRegister, forgot: pageForgot, orders: pageOrders, confirm: pageConfirm };
$(() => {
  renderChrome();
  const fn = PAGES[$("body").attr("data-page")];
  if (fn) Promise.resolve(fn()).catch(e => toast(e.message, "err"));
});
