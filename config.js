// ====== vBuy settings. This is the ONLY file you must edit. ======
// Firebase Console -> gear icon -> Project settings -> General -> Web API Key
const CONFIG = {
  apiKey: "AIzaSyBDuy2PVGerOr4R04VnXKUOadaZR734w_c",   // not a secret password
  projectId: "vbuy-shop-49e66",
  databaseId: "(default)",
  currency: "₹",
  shippingFee: 49,
  freeShippingOver: 500,
  perPage: 8,
  // OPTIONAL: order e-mails through EmailJS (free). Leave as it is to skip e-mails. See README.
  emailjs: { serviceId: "service_rn0xunb", templateId: "template_u0cod4v", publicKey: "kECIiqpzJ-iLfjdiS" }
};
