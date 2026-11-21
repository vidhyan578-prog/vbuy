// Firebase REST helper. Every call is a jQuery $.ajax() request. No Firebase SDK.
const FB = (() => {
  const S_KEY = "vbuy_session";
  const FS = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/${CONFIG.databaseId}/documents`;
  const NET = "Cannot reach Firebase. Check your internet connection.";
  const MSG = {
    EMAIL_EXISTS: "This email is already registered. Please log in.",
    INVALID_LOGIN_CREDENTIALS: "Wrong email or password.",
    INVALID_PASSWORD: "Wrong email or password.",
    EMAIL_NOT_FOUND: "Wrong email or password.",
    INVALID_EMAIL: "Please enter a valid email address.",
    WEAK_PASSWORD: "Password is too weak. Use at least 6 characters.",
    OPERATION_NOT_ALLOWED: "Email/Password sign-in is not turned on in Firebase Authentication.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please try again later.",
    USER_DISABLED: "This account has been disabled."
  };
  const configured = () => !!CONFIG.apiKey && !CONFIG.apiKey.startsWith("PASTE");
  const session = () => { try { return JSON.parse(localStorage.getItem(S_KEY)); } catch (e) { return null; } };
  const saveSession = s => localStorage.setItem(S_KEY, JSON.stringify(s));

  // jQuery Ajax wrapped as a Promise
  function ajax(o) {
    return new Promise((res, rej) => {
      $.ajax(o).done(res).fail(x => { const e = new Error("ajax"); e.status = x.status; e.body = x.responseJSON || {}; rej(e); });
    });
  }
  async function post(url, body, form) {
    try {
      return await ajax({ url, type: "POST", dataType: "json",
        contentType: form ? "application/x-www-form-urlencoded; charset=UTF-8" : "application/json",
        data: form ? body : JSON.stringify(body) });
    } catch (e) {
      if (!e.status) throw new Error(NET);
      const raw = (e.body.error && e.body.error.message) || "Request failed";
      throw new Error(MSG[raw.split(" ")[0]] || raw);
    }
  }
  function makeSession(j) {
    const s = { uid: j.localId, email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, expiresAt: Date.now() + Number(j.expiresIn) * 1000 };
    saveSession(s); return s;
  }
  async function auth(endpoint, email, password) {
    if (!configured()) throw new Error("Open config.js and paste your Firebase Web API Key first.");
    return makeSession(await post(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${CONFIG.apiKey}`, { email, password, returnSecureToken: true }));
  }
  const signUp = (e, p) => auth("signUp", e, p);
  const signIn = (e, p) => auth("signInWithPassword", e, p);
  const signOut = () => localStorage.removeItem(S_KEY);
  async function sendReset(email) {
    if (!configured()) throw new Error("Open config.js and paste your Firebase Web API Key first.");
    try { await post(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${CONFIG.apiKey}`, { requestType: "PASSWORD_RESET", email }); }
    catch (e) { throw new Error(e.message.startsWith("Wrong email") ? "No account found with this email." : e.message); }
  }
  async function getToken() {
    const s = session(); if (!s) return null;
    if (Date.now() < s.expiresAt - 60000) return s.idToken;
    try {
      const j = await post(`https://securetoken.googleapis.com/v1/token?key=${CONFIG.apiKey}`, { grant_type: "refresh_token", refresh_token: s.refreshToken }, true);
      saveSession({ ...s, idToken: j.id_token, refreshToken: j.refresh_token, expiresAt: Date.now() + Number(j.expires_in) * 1000 });
      return j.id_token;
    } catch (e) { signOut(); return null; }
  }

  // ---- Firestore value conversion ----
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    return { mapValue: { fields: encFields(v) } };
  }
  function encFields(o) { const f = {}; for (const k in o) if (o[k] !== undefined) f[k] = enc(o[k]); return f; }
  function dec(v) {
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("timestampValue" in v) return v.timestampValue;
    if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
    if ("mapValue" in v) return decFields(v.mapValue.fields || {});
    return null;
  }
  function decFields(f) { const o = {}; for (const k in f) o[k] = dec(f[k]); return o; }
  const decDoc = d => ({ id: d.name.split("/").pop(), ...decFields(d.fields || {}) });

  async function fs(method, path, body, nullOn404) {
    const tok = await getToken();
    const o = { url: FS + path, type: method, dataType: "json", headers: tok ? { Authorization: "Bearer " + tok } : {} };
    if (body) { o.contentType = "application/json"; o.data = JSON.stringify(body); }
    try { return await ajax(o); }
    catch (e) {
      if (e.status === 404 && nullOn404) return null;
      if (!e.status) throw new Error(NET);
      const m = (e.body.error && e.body.error.message) || "Request failed";
      throw new Error(e.status === 403 ? "Not allowed by Firestore security rules. (" + m + ")" : m);
    }
  }
  async function getDoc(col, id) { const j = await fs("GET", `/${col}/${encodeURIComponent(id)}`, null, true); return j ? decDoc(j) : null; }
  async function listDocs(col) {
    let out = [], token = "";
    do {
      const j = await fs("GET", `/${col}?pageSize=300${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
      out = out.concat((j.documents || []).map(decDoc)); token = j.nextPageToken || "";
    } while (token);
    return out;
  }
  async function addDoc(col, data) { return decDoc(await fs("POST", `/${col}`, { fields: encFields(data) })); }
  async function setDoc(col, id, data) { return decDoc(await fs("PATCH", `/${col}/${encodeURIComponent(id)}`, { fields: encFields(data) })); }
  async function updateDoc(col, id, data) {
    const mask = Object.keys(data).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
    return decDoc(await fs("PATCH", `/${col}/${encodeURIComponent(id)}?${mask}`, { fields: encFields(data) }));
  }
  async function deleteDoc(col, id) { await fs("DELETE", `/${col}/${encodeURIComponent(id)}`); }
  async function queryEq(col, field, value) {
    const j = await fs("POST", ":runQuery", { structuredQuery: { from: [{ collectionId: col }],
      where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: enc(value) } } } });
    return j.filter(x => x.document).map(x => decDoc(x.document));
  }
  async function isAdmin() {
    const s = session(); if (!s) return false;
    try { return (await getDoc("admins", s.uid)) !== null; } catch (e) { return false; }
  }
  // No Firebase Storage (needs the paid plan). The picture is shrunk in the browser (max 600 px, JPEG)
  // and saved as text inside the product document in Firestore.
  function uploadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        const out = c.toDataURL("image/jpeg", 0.75);
        out.length > 700000 ? reject(new Error("Image is too detailed. Please choose a smaller picture.")) : resolve(out);
      };
      img.onerror = () => reject(new Error("Could not read this image file."));
      img.src = url;
    });
  }
  return { configured, session, signUp, signIn, signOut, sendReset, getDoc, listDocs, addDoc, setDoc, updateDoc, deleteDoc, queryEq, isAdmin, uploadImage };
})();
