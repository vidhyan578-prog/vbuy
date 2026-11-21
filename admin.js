/* vBuy v2 - admin dashboard. Security is enforced by Firestore rules (admins collection), not by this page. */
async function pageAdmin() {
  const $gate = $("#gate"), s = FB.session();
  if (!s) { $gate.html(`<h1>Admin login</h1><p>Please sign in with your admin account.</p><a class="btn" href="login.html?next=admin.html">Admin login</a>`); return; }
  if (!(await FB.isAdmin())) {
    $gate.html(`<h1>Access denied</h1><p>${esc(s.email)} is not an admin. Admin rights are given in the Firebase Console (see README, step 6). This is checked by Firestore, not by this page.</p><a class="btn" href="index.html">Back to shop</a>`); return;
  }
  $gate.hide(); $("#adminApp").prop("hidden", false);
  const PER = 8, HIGH = 100, LOW = 15;
  let cats = [], prods = [], custs = [], orders = [], pg = 1, lastCsv = null;
  const catName = id => (cats.find(c => c.id === id) || {}).name || "—";
  const valid = o => o.status !== "Cancelled";
  const fail = e => { toast(e.message, "err"); return []; };

  /* ----- load everything ----- */
  async function loadAll() {
    [cats, prods, custs, orders] = await Promise.all([FB.listDocs("categories").catch(fail), FB.listDocs("products").catch(fail), FB.listDocs("customers").catch(fail), FB.listDocs("orders").catch(fail)]);
    cats.sort((a, b) => a.name.localeCompare(b.name)); prods.sort((a, b) => a.name.localeCompare(b.name));
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    drawStats(); drawCatSelects(); drawProducts(); drawCats(); drawCusts(); drawOrders();
  }
  function drawStats() {
    $("#stats").html(`<div><b>${prods.length}</b>Products</div><div><b>${custs.length}</b>Customers</div><div><b>${orders.length}</b>Orders</div>
      <div><b>${money(orders.filter(valid).reduce((n, o) => n + o.total, 0))}</b>Sales (not cancelled)</div>`);
  }
  $(".tab").on("click", function () {
    $(".tab").removeClass("on"); $(this).addClass("on");
    $(".pane").each(function () { $(this).prop("hidden", this.id !== "tab-" + $(".tab.on").attr("data-tab")); });
  });

  /* ----- products ----- */
  const $f = $("#pForm"), $prev = $("#preview");
  function drawCatSelects() {
    const opts = cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    const cur = $f.find("[name=catId]").val(), fc = $("#fCat").val();
    $f.find("[name=catId]").html(`<option value="">Select a category</option>` + opts).val(cur);
    $("#fCat").html(`<option value="">All categories</option>` + opts).val(fc);
  }
  function drawProducts() {
    const q = $("#fQ").val().trim().toLowerCase(), cat = $("#fCat").val();
    const list = prods.filter(p => (!cat || p.catId === cat) && (!q || (p.name + " " + p.id).toLowerCase().includes(q)));
    const pages = Math.max(1, Math.ceil(list.length / PER)); pg = Math.min(pg, pages);
    $("#pRows").html(list.slice((pg - 1) * PER, pg * PER).map(p => `<tr><td>${imgTag(p.image, p.name)}</td><td>${esc(p.id)}</td><td>${esc(p.name)}</td><td>${esc(catName(p.catId))}</td><td>${money(p.price)}</td><td>${p.stock}</td>
      <td><span class="badge ${p.active === false ? "off" : "on"}">${p.active === false ? "Inactive" : "Active"}</span></td>
      <td><button class="btn small light" data-act="edit" data-id="${esc(p.id)}">Edit</button> <button class="btn small light" data-act="toggle" data-id="${esc(p.id)}">${p.active === false ? "Activate" : "Deactivate"}</button> <button class="btn small danger" data-act="del" data-id="${esc(p.id)}">Delete</button></td></tr>`).join("")
      || `<tr><td colspan="8">No products found. Add one, or import the sample products.</td></tr>`);
    $("#pPager").html(pages > 1 ? Array.from({ length: pages }, (_, i) => `<button type="button" data-pg="${i + 1}" class="${i + 1 === pg ? "on" : ""}">${i + 1}</button>`).join("") : "");
  }
  $("#pPager").on("click", "[data-pg]", function () { pg = +$(this).attr("data-pg"); drawProducts(); });
  $("#fCat").on("change", () => { pg = 1; drawProducts(); });
  $("#fQ").on("input", () => { pg = 1; drawProducts(); });
  function resetForm() { $f[0].reset(); $f.find("[name=id]").val(""); $f.find("[name=imageUrl]").val(""); $prev.prop("hidden", true); $("#pFormTitle").text("Add product"); $("#pIdLine").text(""); $("#pErr").text(""); }
  $("#pRows").on("click", "[data-act]", async function () {
    const act = $(this).attr("data-act"), id = $(this).attr("data-id"), p = prods.find(x => x.id === id);
    try {
      if (act === "edit") {
        $f.find("[name=id]").val(p.id); $f.find("[name=name]").val(p.name); $f.find("[name=catId]").val(p.catId); $f.find("[name=price]").val(p.price);
        $f.find("[name=stock]").val(p.stock); $f.find("[name=description]").val(p.description); $f.find("[name=imageUrl]").val(p.image);
        $prev.attr("src", p.image).prop("hidden", false); $("#pFormTitle").text("Edit product"); $("#pIdLine").text("Product ID: " + p.id + " (cannot be changed)");
        $f[0].scrollIntoView({ behavior: "smooth" });
      } else if (act === "toggle") {
        await FB.updateDoc("products", id, { active: p.active === false }); toast(p.active === false ? "Product activated" : "Product deactivated (hidden from the shop)"); await loadAll();
      } else if (act === "del" && confirm(`Delete "${p.name}"? This cannot be undone. (Use Deactivate to just hide it.)`)) {
        await FB.deleteDoc("products", id); toast("Product deleted"); resetForm(); await loadAll();
      }
    } catch (err) { toast(err.message, "err"); }
  });
  $f.find("[name=image]").on("change", function () { const x = this.files[0]; if (x) $prev.attr("src", URL.createObjectURL(x)).prop("hidden", false); });
  $("#pCancel").on("click", resetForm);
  $f.on("submit", async e => {
    e.preventDefault();
    const v = n => $f.find(`[name=${n}]`).val(), name = v("name").trim(), catId = v("catId"), description = v("description").trim();
    const price = parseFloat(v("price")), stock = parseInt(v("stock")), file = $f.find("[name=image]")[0].files[0], $e = $("#pErr");
    if (name.length < 2) return $e.text("Enter a product title.");
    if (!catId) return $e.text("Choose a category. (Add one in the Categories tab first if the list is empty.)");
    if (!(price > 0)) return $e.text("Price must be more than 0.");
    if (!(stock >= 0) || String(v("stock")).includes(".")) return $e.text("Qty must be a whole number, 0 or more.");
    if (description.length < 5) return $e.text("Enter a short description.");
    if (file && !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return $e.text("Image must be JPG, PNG, WebP or GIF.");
    if (file && file.size > 2 * 1024 * 1024) return $e.text("Image is bigger than 2 MB.");
    if (!file && !v("imageUrl")) return $e.text("Please choose a product image.");
    $e.text(""); const $b = $("#pSave").prop("disabled", true).text("Saving...");
    try {
      const image = file ? await FB.uploadImage(file) : v("imageUrl"), data = { name, catId, price, stock, description, image };
      if (v("id")) await FB.updateDoc("products", v("id"), data); else await FB.addDoc("products", { ...data, active: true, createdAt: new Date() });
      toast("Product saved"); resetForm(); await loadAll();
    } catch (err) { $e.text(err.message); }
    $b.prop("disabled", false).text("Save product");
  });
  $("#importBtn").on("click", async () => {
    if (!confirm("Save the 5 sample categories and 12 sample products into Firestore?")) return;
    try {
      for (const c of await $.getJSON("categories.json")) { const { id, ...r } = c; await FB.setDoc("categories", id, r); }
      for (const p of await $.getJSON("products.json")) { const { id, ...r } = p; await FB.setDoc("products", id, { ...r, createdAt: new Date() }); }
      toast("Sample data imported"); await loadAll();
    } catch (err) { toast(err.message, "err"); }
  });

  /* ----- categories ----- */
  const $cf = $("#cForm");
  function drawCats() {
    $("#cRows").html(cats.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(c.name)}</td><td>${prods.filter(p => p.catId === c.id).length}</td>
      <td><button class="btn small light" data-act="edit" data-id="${esc(c.id)}">Edit</button> <button class="btn small danger" data-act="del" data-id="${esc(c.id)}">Delete</button></td></tr>`).join("") || `<tr><td colspan="4">No categories yet.</td></tr>`);
  }
  function resetCat() { $cf[0].reset(); $cf.find("[name=id]").val(""); $("#cFormTitle").text("Add category"); $("#cIdLine").text(""); $("#cErr").text(""); }
  $("#cCancel").on("click", resetCat);
  $("#cRows").on("click", "[data-act]", async function () {
    const act = $(this).attr("data-act"), id = $(this).attr("data-id"), c = cats.find(x => x.id === id);
    if (act === "edit") { $cf.find("[name=id]").val(c.id); $cf.find("[name=name]").val(c.name); $("#cFormTitle").text("Edit category"); $("#cIdLine").text("Category ID: " + c.id + " (cannot be changed)"); return; }
    const n = prods.filter(p => p.catId === id).length;
    if (n) return toast(`Cannot delete: ${n} product(s) use "${c.name}". Move or delete them first.`, "err");
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try { await FB.deleteDoc("categories", id); toast("Category deleted"); resetCat(); await loadAll(); } catch (err) { toast(err.message, "err"); }
  });
  $cf.on("submit", async e => {
    e.preventDefault();
    const name = $cf.find("[name=name]").val().trim(), id = $cf.find("[name=id]").val(), $e = $("#cErr");
    if (name.length < 2) return $e.text("Enter a category name (at least 2 letters).");
    try {
      if (id) await FB.updateDoc("categories", id, { name });
      else {
        const nid = slug(name); if (!nid) return $e.text("Use letters or numbers in the name.");
        if (cats.some(c => c.id === nid)) return $e.text("This category already exists.");
        await FB.setDoc("categories", nid, { name });
      }
      $e.text(""); toast("Category saved"); resetCat(); await loadAll();
    } catch (err) { $e.text(err.message); }
  });

  /* ----- customers + credit limit ----- */
  function drawCusts() {
    $("#uRows").html(custs.map(c => `<tr><td>${esc(c.fullName)}</td><td>${esc(c.email)}</td><td>${esc(c.mobile || "")}</td>
      <td><input type="number" min="0" max="1000000" step="1" value="${c.creditLimit || 0}" data-lim="${esc(c.id)}"></td><td>${money(creditUsed(orders.filter(o => o.uid === c.id)))}</td>
      <td><button class="btn small" data-act="save" data-id="${esc(c.id)}">Save</button> <button class="btn small light" data-act="1000" data-id="${esc(c.id)}">Set 1000</button> <button class="btn small danger" data-act="rm" data-id="${esc(c.id)}">Remove</button></td></tr>`).join("") || `<tr><td colspan="6">No customers yet.</td></tr>`);
  }
  $("#uRows").on("click", "[data-act]", async function () {
    const act = $(this).attr("data-act"), id = $(this).attr("data-id"), $in = $(`input[data-lim="${id}"]`);
    let lim = act === "1000" ? 1000 : act === "rm" ? 0 : Number($in.val());
    if (!Number.isInteger(lim) || lim < 0 || lim > 1000000) return toast("Credit limit must be a whole number from 0 to 1,000,000.", "err");
    try { await FB.updateDoc("customers", id, { creditLimit: lim }); toast("Credit limit saved: " + money(lim)); await loadAll(); } catch (err) { toast(err.message, "err"); }
  });

  /* ----- orders ----- */
  function drawOrders() { $("#allOrders").html(orders.length ? orders.map(o => orderCard(o, true)).join("") : `<div class="card">No orders yet.</div>`); }
  $("#allOrders").on("change", ".stSel", async function () {
    try { await FB.updateDoc("orders", $(this).attr("data-id"), { status: $(this).val() }); toast("Order status updated"); await loadAll(); } catch (err) { toast(err.message, "err"); await loadAll(); }
  }).on("change", ".creditChk", async function () {
    try { await FB.updateDoc("orders", $(this).attr("data-id"), { creditSettled: this.checked }); toast("Credit payment updated"); await loadAll(); } catch (err) { toast(err.message, "err"); await loadAll(); }
  });

  /* ----- reports ----- */
  const dstr = t => new Date(t).toLocaleDateString();
  const range = () => { const f = $("#rFrom").val(), t = $("#rTo").val(); return { from: f ? new Date(f + "T00:00:00").getTime() : 0, to: t ? new Date(t + "T23:59:59.999").getTime() : Infinity }; };
  const inR = (o, r) => { const t = new Date(o.createdAt).getTime(); return t >= r.from && t <= r.to; };
  const custName = id => { const c = custs.find(x => x.id === id); return c ? c.fullName : "(unknown)"; };
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  function soldItems(r) { // units + revenue per product, valid orders in range
    const m = {};
    orders.filter(o => valid(o) && inR(o, r)).forEach(o => (o.items || []).forEach(i => { const x = m[i.id] || (m[i.id] = { id: i.id, name: i.name, catId: i.catId, units: 0, rev: 0 }); x.units += i.qty; x.rev += i.qty * i.price; }));
    return m;
  }
  const orderRows = (list) => list.map(o => [dstr(o.createdAt), o.billNo || o.id.slice(0, 8), custName(o.uid), (o.items || []).reduce((n, i) => n + i.qty, 0), o.paymentMethod || "Cash", o.status, money(o.total)]);
  const ORDER_COLS = ["Date", "Bill no", "Customer", "Items", "Payment", "Status", "Total"];
  const stockRows = list => list.map(p => [p.id, p.name, catName(p.catId), p.stock, money(p.price), money(p.stock * p.price), p.active === false ? "Inactive" : "Active"]);
  const STOCK_COLS = ["ID", "Title", "Category", "Qty", "Price", "Stock value", "Status"];
  const byCust = (list) => { const m = {}; list.forEach(o => { const x = m[o.uid] || (m[o.uid] = { uid: o.uid, n: 0, t: 0 }); x.n++; x.t += o.total; }); return Object.values(m).sort((a, b) => b.t - a.t); };
  const REPORTS = {
    cust_all: { label: "Customer – all customers (all columns)", run: () => ({ cols: ["ID", "Name", "Email", "Mobile", "Credit limit", "Unpaid credit", "Orders", "Total purchases"],
      rows: custs.map(c => { const m = orders.filter(o => o.uid === c.id && valid(o)); return [c.id, c.fullName, c.email, c.mobile || "", money(c.creditLimit || 0), money(creditUsed(m)), m.length, money(sum(m, o => o.total))]; }) }) },
    cust_top10: { label: "Customer – top 10 customers (date range)", dated: 1, run: r => { const l = byCust(orders.filter(o => valid(o) && inR(o, r))).slice(0, 10);
      return { cols: ["Rank", "Customer", "Orders", "Total purchases"], rows: l.map((x, i) => [i + 1, custName(x.uid), x.n, money(x.t)]) }; } },
    cust_cash: { label: "Customer – cash purchase report (date range)", dated: 1, run: r => { const l = byCust(orders.filter(o => valid(o) && inR(o, r) && (o.paymentMethod || "Cash") === "Cash"));
      return { cols: ["Customer", "Cash orders", "Total"], rows: l.map(x => [custName(x.uid), x.n, money(x.t)]), foot: ["Total", sum(l, x => x.n), money(sum(l, x => x.t))] }; } },
    cust_credit: { label: "Customer – credit purchase report (date range)", dated: 1, run: r => { const m = orders.filter(o => valid(o) && inR(o, r) && o.paymentMethod === "Credit"), l = byCust(m);
      return { cols: ["Customer", "Credit orders", "Total", "Unpaid"], rows: l.map(x => [custName(x.uid), x.n, money(x.t), money(creditUsed(m.filter(o => o.uid === x.uid)))]), foot: ["Total", sum(l, x => x.n), money(sum(l, x => x.t)), money(creditUsed(m))] }; } },
    inv_all: { label: "Inventory – current stock (all)", run: () => ({ cols: STOCK_COLS, rows: stockRows(prods), foot: ["", "Total", "", sum(prods, p => p.stock), "", money(sum(prods, p => p.stock * p.price)), ""] }) },
    inv_cat: { label: "Inventory – category wise", run: () => ({ cols: ["Category", "Products", "Total qty", "Stock value"], rows: cats.map(c => { const l = prods.filter(p => p.catId === c.id); return [c.name, l.length, sum(l, p => p.stock), money(sum(l, p => p.stock * p.price))]; }) }) },
    inv_high: { label: `Inventory – high stock (more than ${HIGH} units)`, run: () => ({ cols: STOCK_COLS, rows: stockRows(prods.filter(p => p.stock > HIGH)) }) },
    inv_low: { label: `Inventory – low stock (less than ${LOW} units)`, run: () => ({ cols: STOCK_COLS, rows: stockRows(prods.filter(p => p.stock < LOW)) }) },
    sales_all: { label: "Sales – all sales (date range)", dated: 1, run: r => { const l = orders.filter(o => valid(o) && inR(o, r)); return { cols: ORDER_COLS, rows: orderRows(l), foot: ["Total", "", "", "", "", "", money(sum(l, o => o.total))] }; } },
    sales_cat: { label: "Sales – category wise (date range)", dated: 1, run: r => { const m = {}; Object.values(soldItems(r)).forEach(i => { const k = catName(i.catId), x = m[k] || (m[k] = { units: 0, rev: 0 }); x.units += i.units; x.rev += i.rev; });
      const e = Object.entries(m).sort((a, b) => b[1].rev - a[1].rev); return { cols: ["Category", "Units sold", "Revenue"], rows: e.map(([k, x]) => [k, x.units, money(x.rev)]), foot: ["Total", sum(e, x => x[1].units), money(sum(e, x => x[1].rev))] }; } },
    sales_cash: { label: "Sales – cash sales (date range)", dated: 1, run: r => { const l = orders.filter(o => valid(o) && inR(o, r) && (o.paymentMethod || "Cash") === "Cash"); return { cols: ORDER_COLS, rows: orderRows(l), foot: ["Total", "", "", "", "", "", money(sum(l, o => o.total))] }; } },
    sales_credit: { label: "Sales – credit sales (date range)", dated: 1, run: r => { const l = orders.filter(o => valid(o) && inR(o, r) && o.paymentMethod === "Credit"); return { cols: ORDER_COLS, rows: orderRows(l), foot: ["Total", "", "", "", "", "", money(sum(l, o => o.total))] }; } },
    sales_top10: { label: "Sales – top 10 selling items (date range)", dated: 1, run: r => { const l = Object.values(soldItems(r)).sort((a, b) => b.units - a.units).slice(0, 10);
      return { cols: ["Rank", "Item", "Category", "Units sold", "Revenue"], rows: l.map((x, i) => [i + 1, x.name, catName(x.catId), x.units, money(x.rev)]) }; } },
    sales_bottom10: { label: "Sales – bottom 10 selling items (date range, includes items with 0 sales)", dated: 1, run: r => { const m = soldItems(r);
      const l = prods.map(p => ({ name: p.name, catId: p.catId, units: (m[p.id] || {}).units || 0, rev: (m[p.id] || {}).rev || 0 })).sort((a, b) => a.units - b.units || a.name.localeCompare(b.name)).slice(0, 10);
      return { cols: ["Rank", "Item", "Category", "Units sold", "Revenue"], rows: l.map((x, i) => [i + 1, x.name, catName(x.catId), x.units, money(x.rev)]) }; } }
  };
  $("#rSel").html(Object.entries(REPORTS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join(""));
  const syncDates = () => $("#rFrom,#rTo").prop("disabled", !REPORTS[$("#rSel").val()].dated);
  $("#rSel").on("change", syncDates); syncDates();
  $("#rRun").on("click", () => {
    const rep = REPORTS[$("#rSel").val()], r = range();
    if (rep.dated && r.from > r.to) return toast("The From date must be before the To date.", "err");
    const out = rep.run(r); lastCsv = { name: $("#rSel").val(), ...out };
    $("#rNote").text(rep.dated ? `Cancelled orders are not counted. ${$("#rFrom").val() || $("#rTo").val() ? "" : "No dates chosen: showing all dates."}` : "Cancelled orders are not counted in purchase totals.");
    $("#rOut").html(`<table class="rep"><thead><tr>${out.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${out.rows.map(x => `<tr>${x.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${out.cols.length}">No data for this report.</td></tr>`}</tbody>
      ${out.foot ? `<tfoot><tr>${out.foot.map(c => `<td>${esc(c)}</td>`).join("")}</tr></tfoot>` : ""}</table>`);
  });
  $("#rCsv").on("click", () => {
    if (!lastCsv) return toast("Click \"Show report\" first.", "err");
    const q = c => '"' + String(c).replace(/"/g, '""') + '"', rows = [lastCsv.cols, ...lastCsv.rows, ...(lastCsv.foot ? [lastCsv.foot] : [])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv" }));
    a.download = "vbuy-" + lastCsv.name + ".csv"; document.body.appendChild(a); a.click(); a.remove();
  });

  await loadAll();
}
PAGES.admin = pageAdmin;
