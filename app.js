// Teszt jegyértékesítő rendszer - csak HTML + JS
// GitHub Pages-en is fut. Nincs backend, nincs valódi fizetés.
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

const STORAGE_ORDERS = "ticket_demo_orders_v1";
const STORAGE_CART = "ticket_demo_cart_v1";
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
    $("successBox").classList.add("hidden");
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

  $("successBox").classList.remove("hidden");
  $("successBox").innerHTML = `
    <h3>Sikeres teszt vásárlás</h3>
    <p>Rendeléskód: <span class="code">${order.orderCode}</span></p>
    <p>Jegykódok:</p>
    ${order.items.map(item => `
      <p><b>${escapeHtml(item.name)}</b><br>
      ${item.codes.map(c => `<span class="code">${c}</span>`).join(" ")}</p>
    `).join("")}
    <p>Összeg: <b>${formatFt(order.total)}</b></p>
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
      <td><span class="code">${order.orderCode}</span><br><small>${order.status}</small></td>
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
          .map(code => `<span class="code">${code}</span>`)
          .join("<br>")}
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

// Globális függvények az inline onclick miatt
window.addToCart = addToCart;
window.changeQty = changeQty;
