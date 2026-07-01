// Teszt jegyértékesítő rendszer - csak HTML + JS
// Nincs backend, nincs valódi fizetés.
// A rendelések a böngésző localStorage tárhelyére mentődnek.

const TICKETS = [
  {
    id: "normal",
    name: "Normál jegy",
    prefix: "NOR",
    price: 4990,
    quota: 200,
    desc: "Belépés az eseményre, egyszeri beléptetésre alkalmas jegykóddal.",
    perks: ["Alap belépő", "Digitális jegykód"]
  },
  {
    id: "vip",
    name: "VIP jegy",
    prefix: "VIP",
    price: 14990,
    quota: 40,
    desc: "Gyorsabb beléptetés, külön VIP sáv és extra ajándék.",
    perks: ["VIP sáv", "Ajándék", "Limitált"]
  },
  {
    id: "backstage",
    name: "Backstage teszt jegy",
    prefix: "BCK",
    price: 29990,
    quota: 10,
    desc: "Prémium tesztjegy kis darabszámmal, admin készletellenőrzéshez.",
    perks: ["Backstage", "Nagyon limitált"]
  }
];

const STORAGE_ORDERS = "ticket_demo_orders_v2_qr";
const STORAGE_CART = "ticket_demo_cart_v2_qr";
const ADMIN_PASSWORD = "admin123";

let cart = loadCart();

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  renderTickets();
  renderCart();
  bindEvents();

  const hash = window.location.hash.replace("#", "");
  if (hash === "admin") showTab("admin");
});

function bindEvents() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  $("scrollTickets").addEventListener("click", () => {
    $("ticketsTitle").scrollIntoView({ behavior: "smooth" });
  });

  $("checkoutBtn").addEventListener("click", () => {
    if (cartCount() === 0) {
      alert("Először tegyél jegyet a kosárba.");
      return;
    }
    $("checkoutBox").classList.toggle("hidden");
  });

  $("clearCartBtn").addEventListener("click", () => {
    cart = {};
    saveCart();
    renderCart();
  });

  $("buyBtn").addEventListener("click", finishOrder);

  $("loginBtn").addEventListener("click", adminLogin);
  $("backShopBtn").addEventListener("click", () => showTab("shop"));
  $("adminSearch").addEventListener("input", renderAdmin);
  $("resetBtn").addEventListener("click", resetDemoData);
  $("exportBtn").addEventListener("click", exportCSV);
}

function showTab(tab) {
  const isAdmin = tab === "admin";
  $("shopView").classList.toggle("hidden", isAdmin);
  $("adminView").classList.toggle("hidden", !isAdmin);

  document.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  window.location.hash = isAdmin ? "admin" : "shop";
  if (isAdmin && $("adminPanel").classList.contains("hidden") === false) {
    renderAdmin();
  }
}

function renderTickets() {
  const sold = getSoldByTicket();
  $("ticketList").innerHTML = TICKETS.map(ticket => {
    const remaining = Math.max(ticket.quota - (sold[ticket.id] || 0), 0);
    const disabled = remaining <= 0;
    return `
      <article class="box ticket">
        <div class="meta">
          <span class="pill">${ticket.prefix}</span>
          <span class="pill">Maradék: ${remaining} db</span>
        </div>
        <h3>${escapeHtml(ticket.name)}</h3>
        <p>${escapeHtml(ticket.desc)}</p>
        <div class="meta">
          ${ticket.perks.map(p => `<span class="pill">${escapeHtml(p)}</span>`).join("")}
        </div>
        <div class="price">${formatFt(ticket.price)}</div>
        <button ${disabled ? "disabled" : ""} onclick="addToCart('${ticket.id}')">
          ${disabled ? "Elfogyott" : "Kosárba"}
        </button>
      </article>
    `;
  }).join("");
}

function addToCart(ticketId) {
  const ticket = getTicket(ticketId);
  if (!ticket) return;

  const sold = getSoldByTicket()[ticketId] || 0;
  const currentQty = cart[ticketId] || 0;
  if (sold + currentQty >= ticket.quota) {
    alert("Ebből a jegyből nincs több elérhető készlet.");
    return;
  }

  cart[ticketId] = currentQty + 1;
  saveCart();
  renderCart();
}

function changeQty(ticketId, delta) {
  const ticket = getTicket(ticketId);
  if (!ticket) return;

  const next = (cart[ticketId] || 0) + delta;
  if (next <= 0) {
    delete cart[ticketId];
  } else {
    const sold = getSoldByTicket()[ticketId] || 0;
    if (sold + next > ticket.quota) {
      alert("Nincs ennyi szabad jegy.");
      return;
    }
    cart[ticketId] = next;
  }

  saveCart();
  renderCart();
}

function renderCart() {
  const ids = Object.keys(cart);
  if (ids.length === 0) {
    $("cartItems").innerHTML = `<p>A kosár üres.</p>`;
    $("checkoutBox").classList.add("hidden");
  } else {
    $("cartItems").innerHTML = ids.map(id => {
      const ticket = getTicket(id);
      const qty = cart[id] || 0;
      return `
        <div class="cart-row">
          <div>
            <b>${escapeHtml(ticket.name)}</b><br>
            <small>${formatFt(ticket.price)} / db</small>
          </div>
          <div class="qty">
            <button onclick="changeQty('${id}', -1)">−</button>
            <b>${qty}</b>
            <button onclick="changeQty('${id}', 1)">+</button>
          </div>
        </div>
      `;
    }).join("");
  }

  $("cartTotal").textContent = formatFt(cartTotal());
  $("checkoutBtn").disabled = cartCount() === 0;
}

function finishOrder() {
  const name = $("buyerName").value.trim();
  const email = $("buyerEmail").value.trim();
  const note = $("buyerNote").value.trim();

  if (cartCount() === 0) {
    alert("A kosár üres.");
    return;
  }

  if (!name || !email) {
    alert("Add meg a nevet és az e-mail címet.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("Az e-mail cím formátuma hibás.");
    return;
  }

  const orders = loadOrders();

  // Készlet újraellenőrzés vásárlás előtt
  const sold = getSoldByTicket();
  for (const ticketId of Object.keys(cart)) {
    const ticket = getTicket(ticketId);
    if ((sold[ticketId] || 0) + cart[ticketId] > ticket.quota) {
      alert(`Nincs elég készlet ebből: ${ticket.name}`);
      return;
    }
  }

  const orderCode = generateOrderCode();
  const items = Object.keys(cart).map(ticketId => {
    const ticket = getTicket(ticketId);
    const qty = cart[ticketId];
    const codes = Array.from({ length: qty }, (_, i) =>
      generateTicketCode(ticket.prefix, orderCode, i + 1)
    );

    return {
      ticketId,
      name: ticket.name,
      prefix: ticket.prefix,
      price: ticket.price,
      qty,
      total: ticket.price * qty,
      codes
    };
  });

  const order = {
    id: cryptoId(),
    createdAt: new Date().toISOString(),
    orderCode,
    buyer: { name, email },
    note,
    items,
    total: items.reduce((sum, item) => sum + item.total, 0),
    status: "TESZT_FIZETVE"
  };

  orders.unshift(order);
  localStorage.setItem(STORAGE_ORDERS, JSON.stringify(orders));

  cart = {};
  saveCart();
  renderCart();
  renderTickets();

  $("buyerName").value = "";
  $("buyerEmail").value = "";
  $("buyerNote").value = "";

  const qrCards = order.items.flatMap(item =>
    item.codes.map(code => `
      <div class="qr-card">
        <b>${escapeHtml(item.name)}</b>
        <span class="code">${escapeHtml(code)}</span>
        ${makeQrSvg(code, 132)}
      </div>
    `)
  ).join("");

  $("successBox").classList.remove("hidden");
  $("successBox").innerHTML = `
    <h3>Sikeres teszt vásárlás</h3>
    <p>Rendeléskód: <span class="code">${escapeHtml(order.orderCode)}</span></p>
    <p>Összeg: <b>${formatFt(order.total)}</b></p>
    <h4>Jegyek QR-kóddal</h4>
    <div class="qr-grid">${qrCards}</div>
    <button class="secondary" onclick="window.print()" style="margin-top:14px;">Jegyek nyomtatása</button>
  `;
}

function adminLogin() {
  if ($("adminPassword").value !== ADMIN_PASSWORD) {
    alert("Hibás admin jelszó. Demo jelszó: admin123");
    return;
  }
  $("adminPanel").classList.remove("hidden");
  renderAdmin();
}

function renderAdmin() {
  const orders = loadOrders();
  const search = ($("adminSearch")?.value || "").toLowerCase().trim();

  const filtered = orders.filter(order => {
    const haystack = [
      order.orderCode,
      order.buyer.name,
      order.buyer.email,
      order.note,
      ...order.items.flatMap(item => [item.name, item.prefix, ...item.codes])
    ].join(" ").toLowerCase();

    return !search || haystack.includes(search);
  });

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const totalTickets = orders.reduce((sum, order) =>
    sum + order.items.reduce((s, item) => s + item.qty, 0), 0
  , 0);

  $("statOrders").textContent = orders.length;
  $("statTickets").textContent = totalTickets;
  $("statRevenue").textContent = formatFt(totalRevenue);
  $("statAvg").textContent = formatFt(orders.length ? Math.round(totalRevenue / orders.length) : 0);

  const sold = getSoldByTicket();
  $("ticketAdminRows").innerHTML = TICKETS.map(ticket => {
    const soldQty = sold[ticket.id] || 0;
    return `
      <tr>
        <td><b>${escapeHtml(ticket.name)}</b></td>
        <td>${formatFt(ticket.price)}</td>
        <td><span class="code">${ticket.prefix}</span></td>
        <td>${ticket.quota} db</td>
        <td>${soldQty} db</td>
        <td>${Math.max(ticket.quota - soldQty, 0)} db</td>
      </tr>
    `;
  }).join("");

  $("orderRows").innerHTML = filtered.length ? filtered.map(order => `
    <tr>
      <td>${formatDate(order.createdAt)}</td>
      <td><span class="code">${escapeHtml(order.orderCode)}</span><br><small>${order.status}</small></td>
      <td>
        <b>${escapeHtml(order.buyer.name)}</b><br>
        <small>${escapeHtml(order.buyer.email)}</small>
      </td>
      <td>
        ${order.items.map(item =>
          `${escapeHtml(item.name)}<br><small>${item.qty} db × ${formatFt(item.price)}</small>`
        ).join("<hr>")}
      </td>
      <td>
        ${order.items.flatMap(item => item.codes)
          .map(code => `
            <div class="qr-small">
              <span class="code">${escapeHtml(code)}</span>
              ${makeQrSvg(code, 76)}
            </div>
          `)
          .join("")}
      </td>
      <td><b>${formatFt(order.total)}</b></td>
      <td>${escapeHtml(order.note || "-")}</td>
    </tr>
  `).join("") : `
    <tr><td colspan="7">Nincs találat.</td></tr>
  `;
}

function resetDemoData() {
  if (!confirm("Biztosan törlöd az összes demo rendelést?")) return;
  localStorage.removeItem(STORAGE_ORDERS);
  renderTickets();
  renderCart();
  renderAdmin();
}

function exportCSV() {
  const orders = loadOrders();
  if (!orders.length) {
    alert("Nincs exportálható rendelés.");
    return;
  }

  const rows = [
    ["Dátum", "Rendeléskód", "Név", "Email", "Jegy", "Darab", "Egységár", "Összeg", "Jegykódok", "Megjegyzés", "Státusz"]
  ];

  orders.forEach(order => {
    order.items.forEach(item => {
      rows.push([
        formatDate(order.createdAt),
        order.orderCode,
        order.buyer.name,
        order.buyer.email,
        item.name,
        item.qty,
        item.price,
        item.total,
        item.codes.join(" | "),
        order.note || "",
        order.status
      ]);
    });
  });

  const csv = rows.map(row => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jegy-rendelesek.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_ORDERS)) || [];
  } catch {
    return [];
  }
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_CART)) || {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem(STORAGE_CART, JSON.stringify(cart));
}

function getSoldByTicket() {
  const sold = {};
  loadOrders().forEach(order => {
    order.items.forEach(item => {
      sold[item.ticketId] = (sold[item.ticketId] || 0) + item.qty;
    });
  });
  return sold;
}

function getTicket(ticketId) {
  return TICKETS.find(t => t.id === ticketId);
}

function cartTotal() {
  return Object.keys(cart).reduce((sum, id) => {
    const ticket = getTicket(id);
    return sum + (ticket ? ticket.price * cart[id] : 0);
  }, 0);
}

function cartCount() {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

function formatFt(value) {
  return new Intl.NumberFormat("hu-HU").format(value) + " Ft";
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function generateOrderCode() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `ORD-${y}${m}${day}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function generateTicketCode(prefix, orderCode, index) {
  const shortOrder = orderCode.split("-").pop();
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${shortOrder}-${String(index).padStart(2, "0")}-${random}`;
}

function cryptoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*
  Beépített QR-kód generátor.
  Fix QR verzió: 3-L, byte mód, rövid jegykódokra.
  Így nem kell külső CDN vagy plusz fájl.
*/
function makeQrSvg(text, pixelSize = 132) {
  const matrix = createQrMatrix(String(text));
  const border = 4;
  const n = matrix.length;
  const full = n + border * 2;
  const scale = pixelSize / full;

  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) {
        path += `M${x + border},${y + border}h1v1h-1z`;
      }
    }
  }

  return `
    <svg viewBox="0 0 ${full} ${full}" width="${pixelSize}" height="${pixelSize}" role="img" aria-label="QR kód">
      <rect width="${full}" height="${full}" fill="#fff"></rect>
      <path d="${path}" fill="#111"></path>
    </svg>
  `;
}

function createQrMatrix(text) {
  const version = 3;
  const size = 4 * version + 17;
  const dataCodewords = 55;
  const eccCodewords = 15;
  const mask = 0;

  const bytes = utf8Bytes(text);
  if (bytes.length > 48) {
    throw new Error("A QR-kód adata túl hosszú ehhez a demo generátorhoz.");
  }

  const data = makeDataCodewords(bytes, dataCodewords);
  const ecc = reedSolomonRemainder(data, reedSolomonDivisor(eccCodewords));
  const allCodewords = data.concat(ecc);

  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (x, y, dark, func = true) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      modules[y][x] = !!dark;
      if (func) isFunction[y][x] = true;
    }
  };

  drawFinder(0, 0, setModule, size);
  drawFinder(size - 7, 0, setModule, size);
  drawFinder(0, size - 7, setModule, size);

  drawAlignment(22, 22, setModule);

  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setModule(i, 6, dark);
    setModule(6, i, dark);
  }

  drawFormatBits(modules, isFunction, size, mask);

  const bits = [];
  for (const b of allCodewords) appendBits(bits, b, 8);

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;

    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (!isFunction[y][x]) {
          let bit = bitIndex < bits.length ? bits[bitIndex] : 0;
          bitIndex++;
          if (((x + y) % 2) === 0) bit ^= 1;
          modules[y][x] = !!bit;
        }
      }
    }

    upward = !upward;
  }

  drawFormatBits(modules, isFunction, size, mask);
  return modules;
}

function makeDataCodewords(bytes, dataCodewords) {
  const bits = [];
  appendBits(bits, 0b0100, 4);       // Byte mode
  appendBits(bits, bytes.length, 8);  // Length for version 1-9

  for (const b of bytes) appendBits(bits, b, 8);

  const maxBits = dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const result = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j++) val = (val << 1) | bits[i + j];
    result.push(val);
  }

  const pads = [0xEC, 0x11];
  let padIndex = 0;
  while (result.length < dataCodewords) {
    result.push(pads[padIndex % 2]);
    padIndex++;
  }

  return result;
}

function drawFinder(x, y, setModule, size) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;

      const dark =
        dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
        (dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));

      setModule(xx, yy, dark);
    }
  }
}

function drawAlignment(cx, cy, setModule) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      setModule(cx + dx, cy + dy, dark);
    }
  }
}

function drawFormatBits(modules, isFunction, size, mask) {
  const bits = getFormatBits(1, mask); // L hibajavítás = 01

  const set = (x, y, i) => {
    modules[y][x] = ((bits >>> i) & 1) !== 0;
    isFunction[y][x] = true;
  };

  for (let i = 0; i <= 5; i++) set(8, i, i);
  set(8, 7, 6);
  set(8, 8, 7);
  set(7, 8, 8);
  for (let i = 9; i < 15; i++) set(14 - i, 8, i);

  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, i);
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, i);

  modules[size - 8][8] = true;
  isFunction[size - 8][8] = true;
}

function getFormatBits(eccLevelBits, mask) {
  let data = (eccLevelBits << 3) | mask;
  let rem = data << 10;
  const generator = 0x537;

  for (let i = 14; i >= 10; i--) {
    if (((rem >>> i) & 1) !== 0) {
      rem ^= generator << (i - 10);
    }
  }

  return ((data << 10) | rem) ^ 0x5412;
}

function appendBits(arr, val, len) {
  for (let i = len - 1; i >= 0; i--) {
    arr.push((val >>> i) & 1);
  }
}

function utf8Bytes(str) {
  return Array.from(new TextEncoder().encode(str));
}

function reedSolomonDivisor(degree) {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;

  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }

  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = Array(divisor.length).fill(0);

  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }

  return result;
}

function gfMultiply(x, y) {
  let z = 0;

  while (y !== 0) {
    if ((y & 1) !== 0) z ^= x;
    x <<= 1;
    if ((x & 0x100) !== 0) x ^= 0x11D;
    y >>>= 1;
  }

  return z;
}

// Globális függvények az inline onclick miatt
window.addToCart = addToCart;
window.changeQty = changeQty;
