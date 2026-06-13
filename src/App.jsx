import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Filter,
  ImagePlus,
  LayoutDashboard,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { catalogSnapshot } from "./data/catalogData.js";

const STORAGE_KEY = "discus-giants-erp-state-v1";

const navigation = [
  { id: "dashboard", label: "Panel", icon: LayoutDashboard },
  { id: "inventory", label: "Inventario", icon: Boxes },
  { id: "quotes", label: "Cotizaciones", icon: FileText },
  { id: "orders", label: "Pedidos", icon: ShoppingCart },
  { id: "arrivals", label: "Por llegar", icon: Truck },
  { id: "custom", label: "Personalizados", icon: Wand2 },
  { id: "store", label: "Tienda", icon: Store },
];

const quoteStatuses = ["Borrador", "Enviada", "Aceptada", "Rechazada"];
const orderStatuses = ["Pendiente", "Pagado", "En preparacion", "Entregado", "Cancelado"];
const arrivalStatuses = ["Planeado", "En transito", "Apartado", "Recibido", "Cancelado"];
const productStatuses = ["Por confirmar", "Disponible", "Reservado", "Preventa", "Clave", "Agotado"];

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatMoney(value, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function pathLabel(path) {
  return Array.isArray(path) && path.length ? path.join(" > ") : "Sin ruta";
}

function firstImage(item) {
  return item?.photos?.[0]?.dataUrl || item?.imageUrl || item?.images?.[0] || "/app-icon.svg";
}

function quoteTotal(items = []) {
  return items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
}

function nextNumber(prefix, list) {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String((list?.length || 0) + 1).padStart(3, "0")}`;
}

function skuFor(item) {
  const kind = (item.kind || "P").slice(0, 3).toUpperCase();
  const code = item.odooId || item.slug || item.id;
  return `${kind}-${String(code).replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`;
}

function createInitialState() {
  const inventory = catalogSnapshot.products.map((item) => ({
    ...item,
    sku: skuFor(item),
    active: true,
    photos: [],
    createdAt: catalogSnapshot.scrapedAt,
    updatedAt: catalogSnapshot.scrapedAt,
  }));

  return {
    version: 1,
    seededFrom: catalogSnapshot.scrapedAt,
    business: catalogSnapshot.business,
    inventory,
    quotes: [],
    orders: [],
    arrivals: [],
    activity: [
      {
        id: uid("act"),
        date: today(),
        label: `Catalogo importado: ${catalogSnapshot.importedProductCount} productos de Odoo + Giants Food`,
      },
    ],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed?.inventory?.length) return createInitialState();
    return parsed;
  } catch {
    return createInitialState();
  }
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const max = 1000;
        const ratio = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({
          id: uid("photo"),
          name: file.name,
          dataUrl: canvas.toDataURL("image/jpeg", 0.84),
          createdAt: today(),
        });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function classForStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("clave") || normalized.includes("aceptada") || normalized.includes("pagado")) {
    return "is-good";
  }
  if (normalized.includes("preventa") || normalized.includes("transito") || normalized.includes("borrador")) {
    return "is-warn";
  }
  if (normalized.includes("agotado") || normalized.includes("cancelado") || normalized.includes("rechazada")) {
    return "is-bad";
  }
  return "is-neutral";
}

function blankProduct() {
  return {
    id: uid("manual"),
    source: "manual",
    sku: `MAN-${Date.now().toString(36).toUpperCase()}`,
    name: "",
    kind: "Pez",
    unit: "ejemplar",
    price: 0,
    cost: 0,
    stock: 0,
    reserved: 0,
    incoming: 0,
    minStock: 0,
    status: "Por confirmar",
    relationPath: ["Peces"],
    tags: ["Manual"],
    imageUrl: "",
    photos: [],
    description: "",
    notes: "",
    active: true,
    createdAt: today(),
    updatedAt: today(),
  };
}

function blankQuote(inventory, initialItem) {
  const item = initialItem || null;
  return {
    id: uid("quote"),
    number: "",
    customer: "",
    phone: "",
    email: "",
    status: "Borrador",
    createdAt: today(),
    validUntil: addDays(7),
    notes: "",
    items: item
      ? [
          {
            id: uid("line"),
            productId: item.id,
            label: item.name,
            relationPath: item.relationPath,
            qty: 1,
            unit: item.unit,
            unitPrice: item.price,
            notes: "",
          },
        ]
      : [
          {
            id: uid("line"),
            productId: "",
            label: "",
            relationPath: [],
            qty: 1,
            unit: "pieza",
            unitPrice: 0,
            notes: "",
          },
        ],
  };
}

function blankArrival() {
  return {
    id: uid("arr"),
    productId: "",
    name: "",
    relationPathText: "Peces > Disco",
    qty: 1,
    eta: addDays(14),
    supplier: "",
    status: "Planeado",
    deposit: 0,
    notes: "",
    createdAt: today(),
  };
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [active, setActive] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("Todos");
  const [productModal, setProductModal] = useState(null);
  const [quoteModal, setQuoteModal] = useState(null);
  const [arrivalModal, setArrivalModal] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const inventory = state.inventory || [];
  const quotes = state.quotes || [];
  const orders = state.orders || [];
  const arrivals = state.arrivals || [];

  const kinds = useMemo(() => ["Todos", ...new Set(inventory.map((item) => item.kind).filter(Boolean))], [inventory]);

  const filteredInventory = useMemo(() => {
    const term = query.trim().toLowerCase();
    return inventory.filter((item) => {
      const haystack = [
        item.name,
        item.sku,
        item.kind,
        item.status,
        pathLabel(item.relationPath),
        item.tags?.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const kindOk = kindFilter === "Todos" || item.kind === kindFilter;
      return kindOk && (!term || haystack.includes(term));
    });
  }, [inventory, query, kindFilter]);

  const stats = useMemo(() => {
    const value = inventory.reduce((sum, item) => sum + Number(item.stock || 0) * Number(item.price || 0), 0);
    const reserved = inventory.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
    const incoming = inventory.reduce((sum, item) => sum + Number(item.incoming || 0), 0);
    const openQuotes = quotes.filter((quote) => !["Aceptada", "Rechazada"].includes(quote.status));
    const quoteValue = openQuotes.reduce((sum, quote) => sum + quoteTotal(quote.items), 0);
    const activeOrders = orders.filter((order) => !["Entregado", "Cancelado"].includes(order.status));
    const lowStock = inventory.filter(
      (item) => Number(item.minStock || 0) > 0 && Number(item.stock || 0) <= Number(item.minStock || 0)
    );
    return { value, reserved, incoming, openQuotes, quoteValue, activeOrders, lowStock };
  }, [inventory, quotes, orders]);

  function addActivity(label) {
    setState((current) => ({
      ...current,
      activity: [{ id: uid("act"), date: today(), label }, ...(current.activity || [])].slice(0, 12),
    }));
  }

  function saveProduct(product) {
    const prepared = {
      ...product,
      price: Number(product.price || 0),
      cost: Number(product.cost || 0),
      stock: Number(product.stock || 0),
      reserved: Number(product.reserved || 0),
      incoming: Number(product.incoming || 0),
      minStock: Number(product.minStock || 0),
      updatedAt: today(),
    };
    setState((current) => {
      const exists = current.inventory.some((item) => item.id === prepared.id);
      return {
        ...current,
        inventory: exists
          ? current.inventory.map((item) => (item.id === prepared.id ? prepared : item))
          : [prepared, ...current.inventory],
      };
    });
    addActivity(`${product.name || "Producto"} actualizado en inventario`);
    setProductModal(null);
    setToast("Producto guardado");
  }

  function deleteProduct(productId) {
    const product = inventory.find((item) => item.id === productId);
    setState((current) => ({
      ...current,
      inventory: current.inventory.filter((item) => item.id !== productId),
    }));
    addActivity(`${product?.name || "Producto"} eliminado del inventario`);
    setToast("Producto eliminado");
  }

  function saveQuote(quote) {
    const prepared = {
      ...quote,
      number: quote.number || nextNumber("COT", quotes),
      items: quote.items.filter((item) => item.label && Number(item.qty) > 0),
    };
    setState((current) => {
      const exists = current.quotes.some((item) => item.id === prepared.id);
      return {
        ...current,
        quotes: exists
          ? current.quotes.map((item) => (item.id === prepared.id ? prepared : item))
          : [prepared, ...current.quotes],
      };
    });
    addActivity(`${prepared.number} guardada para ${prepared.customer || "cliente sin nombre"}`);
    setQuoteModal(null);
    setToast("Cotizacion guardada");
  }

  function convertQuoteToOrder(quote) {
    const order = {
      id: uid("order"),
      number: nextNumber("PED", orders),
      quoteId: quote.id,
      quoteNumber: quote.number,
      customer: quote.customer,
      phone: quote.phone,
      status: "Pendiente",
      createdAt: today(),
      dueDate: addDays(3),
      items: quote.items,
      notes: quote.notes,
    };

    setState((current) => ({
      ...current,
      quotes: current.quotes.map((item) => (item.id === quote.id ? { ...item, status: "Aceptada" } : item)),
      orders: [order, ...current.orders],
      inventory: current.inventory.map((product) => {
        const reservedQty = quote.items
          .filter((item) => item.productId === product.id)
          .reduce((sum, item) => sum + Number(item.qty || 0), 0);
        return reservedQty ? { ...product, reserved: Number(product.reserved || 0) + reservedQty } : product;
      }),
    }));
    addActivity(`${order.number} creado desde ${quote.number}`);
    setToast("Pedido creado");
  }

  function setOrderStatus(orderId, status) {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    const previous = order.status;
    setState((current) => ({
      ...current,
      orders: current.orders.map((item) => (item.id === orderId ? { ...item, status } : item)),
      inventory: current.inventory.map((product) => {
        const qty = order.items
          .filter((item) => item.productId === product.id)
          .reduce((sum, item) => sum + Number(item.qty || 0), 0);
        if (!qty) return product;
        if (status === "Entregado" && previous !== "Entregado") {
          return {
            ...product,
            stock: Math.max(0, Number(product.stock || 0) - qty),
            reserved: Math.max(0, Number(product.reserved || 0) - qty),
          };
        }
        if (status === "Cancelado" && previous !== "Cancelado") {
          return { ...product, reserved: Math.max(0, Number(product.reserved || 0) - qty) };
        }
        return product;
      }),
    }));
    addActivity(`${order.number} cambio a ${status}`);
  }

  function saveArrival(arrival) {
    const selected = inventory.find((item) => item.id === arrival.productId);
    const prepared = {
      ...arrival,
      name: selected?.name || arrival.name,
      relationPathText: selected ? pathLabel(selected.relationPath) : arrival.relationPathText,
      qty: Number(arrival.qty || 0),
      deposit: Number(arrival.deposit || 0),
    };
    setState((current) => ({
      ...current,
      arrivals: [prepared, ...current.arrivals],
      inventory: current.inventory.map((item) =>
        item.id === prepared.productId ? { ...item, incoming: Number(item.incoming || 0) + prepared.qty } : item
      ),
    }));
    addActivity(`${prepared.name || "Llegada"} agregada a proximos ejemplares`);
    setArrivalModal(null);
    setToast("Llegada guardada");
  }

  function receiveArrival(arrivalId) {
    const arrival = arrivals.find((item) => item.id === arrivalId);
    if (!arrival) return;
    setState((current) => {
      const exists = current.inventory.some((item) => item.id === arrival.productId);
      const relationPath = arrival.relationPathText.split(">").map((item) => item.trim()).filter(Boolean);
      const newProduct = !exists
        ? {
            ...blankProduct(),
            id: uid("manual"),
            sku: `ARR-${Date.now().toString(36).toUpperCase()}`,
            name: arrival.name,
            relationPath,
            stock: arrival.qty,
            status: "Disponible",
            notes: arrival.notes,
          }
        : null;
      return {
        ...current,
        arrivals: current.arrivals.map((item) =>
          item.id === arrivalId ? { ...item, status: "Recibido", receivedAt: today() } : item
        ),
        inventory: exists
          ? current.inventory.map((item) =>
              item.id === arrival.productId
                ? {
                    ...item,
                    stock: Number(item.stock || 0) + Number(arrival.qty || 0),
                    incoming: Math.max(0, Number(item.incoming || 0) - Number(arrival.qty || 0)),
                    status: "Disponible",
                  }
                : item
            )
          : [newProduct, ...current.inventory],
      };
    });
    addActivity(`${arrival.name} recibido y sumado a inventario`);
    setToast("Inventario actualizado");
  }

  function resetSeed() {
    const next = createInitialState();
    setState(next);
    setToast("Datos reiniciados");
  }

  async function importBackup(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.inventory || !Array.isArray(parsed.inventory)) {
      throw new Error("Archivo invalido");
    }
    setState(parsed);
    setToast("Respaldo importado");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/app-icon.svg" alt="DG" />
          <div>
            <strong>Discus Giants</strong>
            <span>ERP ligero</span>
          </div>
        </div>
        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={active === item.id ? "is-active" : ""}
                onClick={() => setActive(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span>Fuente</span>
          <a href={state.business.siteUrl} target="_blank" rel="noreferrer">
            Odoo <ExternalLink size={14} />
          </a>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto, SKU, ruta o cliente"
            />
          </div>
          <div className="topbar-actions">
            <label className="icon-button" title="Importar respaldo">
              <Upload size={17} />
              <input
                type="file"
                accept="application/json"
                onChange={(event) => importBackup(event.target.files?.[0]).catch(() => setToast("No se pudo importar"))}
              />
            </label>
            <button
              className="icon-button"
              title="Exportar respaldo"
              onClick={() => downloadJson(`discus-giants-erp-${today()}.json`, state)}
            >
              <Download size={17} />
            </button>
            <button className="icon-button" title="Reiniciar catalogo" onClick={resetSeed}>
              <RefreshCcw size={17} />
            </button>
            <button className="primary-action" onClick={() => setProductModal({ mode: "new", product: blankProduct() })}>
              <Plus size={17} />
              Producto
            </button>
          </div>
        </header>

        {active === "dashboard" && (
          <Dashboard
            state={state}
            stats={stats}
            inventory={inventory}
            setActive={setActive}
            setProductModal={setProductModal}
            setQuoteModal={setQuoteModal}
          />
        )}
        {active === "inventory" && (
          <InventoryView
            inventory={filteredInventory}
            rawInventory={inventory}
            kinds={kinds}
            kindFilter={kindFilter}
            setKindFilter={setKindFilter}
            onEdit={(product) => setProductModal({ mode: "edit", product })}
            onDelete={deleteProduct}
            onQuote={(product) => setQuoteModal({ mode: "new", quote: blankQuote(inventory, product) })}
          />
        )}
        {active === "quotes" && (
          <QuotesView
            quotes={quotes}
            inventory={inventory}
            onNew={() => setQuoteModal({ mode: "new", quote: blankQuote(inventory) })}
            onEdit={(quote) => setQuoteModal({ mode: "edit", quote })}
            onConvert={convertQuoteToOrder}
          />
        )}
        {active === "orders" && <OrdersView orders={orders} onStatus={setOrderStatus} />}
        {active === "arrivals" && (
          <ArrivalsView
            arrivals={arrivals}
            inventory={inventory}
            onNew={() => setArrivalModal(blankArrival())}
            onReceive={receiveArrival}
          />
        )}
        {active === "custom" && (
          <CustomView
            inventory={inventory.filter((item) => item.source === "manual" || item.tags?.includes("Manual"))}
            onNew={() => setProductModal({ mode: "new", product: blankProduct() })}
            onEdit={(product) => setProductModal({ mode: "edit", product })}
          />
        )}
        {active === "store" && (
          <StoreView
            inventory={filteredInventory}
            onQuote={(product) => setQuoteModal({ mode: "new", quote: blankQuote(inventory, product) })}
          />
        )}
      </main>

      {productModal && <ProductModal modal={productModal} onClose={() => setProductModal(null)} onSave={saveProduct} />}
      {quoteModal && (
        <QuoteModal
          modal={quoteModal}
          inventory={inventory}
          onClose={() => setQuoteModal(null)}
          onSave={saveQuote}
        />
      )}
      {arrivalModal && (
        <ArrivalModal
          draft={arrivalModal}
          inventory={inventory}
          onClose={() => setArrivalModal(null)}
          onSave={saveArrival}
          setDraft={setArrivalModal}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Dashboard({ state, stats, inventory, setActive, setProductModal, setQuoteModal }) {
  const featured = inventory.filter((item) => item.featured || item.priority === "top-seller").slice(0, 5);
  const critical = stats.lowStock.slice(0, 6);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operacion</p>
          <h1>Panel general</h1>
        </div>
        <div className="heading-actions">
          <button onClick={() => setQuoteModal({ mode: "new", quote: blankQuote(inventory) })}>
            <FileText size={17} />
            Cotizar
          </button>
          <button onClick={() => setProductModal({ mode: "new", product: blankProduct() })}>
            <PackagePlus size={17} />
            Alta rapida
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="SKUs activos" value={inventory.length} icon={Boxes} />
        <Metric label="Valor capturado" value={formatMoney(stats.value)} icon={ShoppingBag} />
        <Metric label="Reservados" value={stats.reserved} icon={CheckCircle2} />
        <Metric label="Por llegar" value={stats.incoming} icon={CalendarClock} />
        <Metric label="Cotizaciones abiertas" value={stats.openQuotes.length} icon={FileText} />
        <Metric label="Pedidos activos" value={stats.activeOrders.length} icon={Truck} />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>Productos clave</h2>
            <button onClick={() => setActive("store")}>
              Tienda <ChevronRight size={16} />
            </button>
          </div>
          <div className="featured-list">
            {featured.map((item) => (
              <article key={item.id} className="featured-item">
                <img src={firstImage(item)} alt={item.name} />
                <div>
                  <strong>{item.name}</strong>
                  <span>{pathLabel(item.relationPath)}</span>
                </div>
                <b>{formatMoney(item.price)}</b>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>Alertas</h2>
            <AlertTriangle size={18} />
          </div>
          <div className="alert-list">
            {critical.length ? (
              critical.map((item) => (
                <button key={item.id} onClick={() => setProductModal({ mode: "edit", product: item })}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.stock} en stock / minimo {item.minStock}</small>
                  </span>
                  <Pencil size={16} />
                </button>
              ))
            ) : (
              <div className="empty-state">Sin alertas de minimo</div>
            )}
          </div>
        </section>

        <section className="panel activity-panel">
          <div className="panel-title">
            <h2>Actividad</h2>
          </div>
          <div className="timeline">
            {(state.activity || []).map((item) => (
              <div key={item.id}>
                <span>{formatDate(item.date)}</span>
                <p>{item.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <article className="metric-card">
      <Icon size={19} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InventoryView({ inventory, rawInventory, kinds, kindFilter, setKindFilter, onEdit, onDelete, onQuote }) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Inventario</p>
          <h1>Catalogo y existencias</h1>
        </div>
        <div className="filter-row compact">
          <Filter size={17} />
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
            {kinds.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
          <span>{inventory.length} / {rawInventory.length}</span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Ruta</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Reservado</th>
              <th>Por llegar</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="product-cell">
                    <img src={firstImage(item)} alt={item.name} />
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.sku} · {item.kind}</span>
                    </div>
                  </div>
                </td>
                <td className="path-cell">{pathLabel(item.relationPath)}</td>
                <td>{formatMoney(item.price)}</td>
                <td>{item.stock}</td>
                <td>{item.reserved}</td>
                <td>{item.incoming}</td>
                <td>
                  <span className={`pill ${classForStatus(item.status)}`}>{item.status}</span>
                </td>
                <td>
                  <div className="row-actions">
                    <button title="Cotizar" onClick={() => onQuote(item)}>
                      <FileText size={16} />
                    </button>
                    <button title="Editar" onClick={() => onEdit(item)}>
                      <Pencil size={16} />
                    </button>
                    {item.source === "manual" && (
                      <button title="Eliminar" onClick={() => onDelete(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function QuotesView({ quotes, inventory, onNew, onEdit, onConvert }) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Ventas</p>
          <h1>Cotizaciones</h1>
        </div>
        <button className="primary-action" onClick={onNew}>
          <Plus size={17} />
          Cotizacion
        </button>
      </div>
      <div className="cards-grid">
        {quotes.length ? (
          quotes.map((quote) => (
            <article key={quote.id} className="record-card">
              <div className="record-head">
                <div>
                  <strong>{quote.number}</strong>
                  <span>{quote.customer || "Cliente sin nombre"}</span>
                </div>
                <span className={`pill ${classForStatus(quote.status)}`}>{quote.status}</span>
              </div>
              <div className="record-meta">
                <span>{formatDate(quote.createdAt)}</span>
                <span>Vence {formatDate(quote.validUntil)}</span>
              </div>
              <div className="line-preview">
                {quote.items.slice(0, 3).map((item) => (
                  <span key={item.id}>{item.qty} x {item.label}</span>
                ))}
              </div>
              <div className="record-total">{formatMoney(quoteTotal(quote.items))}</div>
              <div className="record-actions">
                <button onClick={() => onEdit(quote)}>
                  <Pencil size={16} />
                  Editar
                </button>
                <button onClick={() => window.print()}>
                  <Printer size={16} />
                  PDF
                </button>
                {quote.status !== "Aceptada" && (
                  <button onClick={() => onConvert(quote)}>
                    <ShoppingCart size={16} />
                    Pedido
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state wide">Sin cotizaciones registradas</div>
        )}
      </div>
    </section>
  );
}

function OrdersView({ orders, onStatus }) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Ventas</p>
          <h1>Pedidos</h1>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Entrega</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <strong>{order.number}</strong>
                  <span className="muted">desde {order.quoteNumber}</span>
                </td>
                <td>{order.customer || "Cliente sin nombre"}</td>
                <td>{formatDate(order.createdAt)}</td>
                <td>{formatDate(order.dueDate)}</td>
                <td>{formatMoney(quoteTotal(order.items))}</td>
                <td>
                  <select value={order.status} onChange={(event) => onStatus(order.id, event.target.value)}>
                    {orderStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan="6">
                  <div className="empty-state">Sin pedidos registrados</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ArrivalsView({ arrivals, inventory, onNew, onReceive }) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Compras</p>
          <h1>Proximos ejemplares</h1>
        </div>
        <button className="primary-action" onClick={onNew}>
          <Plus size={17} />
          Llegada
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ejemplar</th>
              <th>Ruta</th>
              <th>Cantidad</th>
              <th>ETA</th>
              <th>Proveedor</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {arrivals.map((arrival) => (
              <tr key={arrival.id}>
                <td>
                  <strong>{arrival.name || inventory.find((item) => item.id === arrival.productId)?.name}</strong>
                  <span className="muted">{formatMoney(arrival.deposit)} apartado</span>
                </td>
                <td>{arrival.relationPathText}</td>
                <td>{arrival.qty}</td>
                <td>{formatDate(arrival.eta)}</td>
                <td>{arrival.supplier || "Sin proveedor"}</td>
                <td>
                  <span className={`pill ${classForStatus(arrival.status)}`}>{arrival.status}</span>
                </td>
                <td>
                  {arrival.status !== "Recibido" && (
                    <button className="small-action" onClick={() => onReceive(arrival.id)}>
                      <CheckCircle2 size={16} />
                      Recibir
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!arrivals.length && (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">Sin llegadas registradas</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CustomView({ inventory, onNew, onEdit }) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Catalogo flexible</p>
          <h1>Productos personalizados</h1>
        </div>
        <button className="primary-action" onClick={onNew}>
          <Plus size={17} />
          Manual
        </button>
      </div>
      <div className="cards-grid">
        {inventory.map((item) => (
          <article key={item.id} className="record-card product-card">
            <img src={firstImage(item)} alt={item.name} />
            <div className="record-head">
              <div>
                <strong>{item.name}</strong>
                <span>{pathLabel(item.relationPath)}</span>
              </div>
              <span className={`pill ${classForStatus(item.status)}`}>{item.status}</span>
            </div>
            <p>{item.description || item.notes}</p>
            <div className="record-total">{formatMoney(item.price)}</div>
            <button onClick={() => onEdit(item)}>
              <Pencil size={16} />
              Editar
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function StoreView({ inventory, onQuote }) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Tienda</p>
          <h1>Catalogo publico conectado</h1>
        </div>
      </div>
      <div className="store-grid">
        {inventory.map((item) => (
          <article key={item.id} className="store-card">
            <img src={firstImage(item)} alt={item.name} />
            <div>
              <span className="path-cell">{pathLabel(item.relationPath)}</span>
              <h2>{item.name}</h2>
              <p>{item.description || item.notes}</p>
            </div>
            <footer>
              <strong>{formatMoney(item.price)}</strong>
              <button onClick={() => onQuote(item)}>
                <FileText size={16} />
                Cotizar
              </button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductModal({ modal, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({
    ...modal.product,
    relationPathText: pathLabel(modal.product.relationPath),
    tagsText: (modal.product.tags || []).join(", "),
  }));
  const [photoBusy, setPhotoBusy] = useState(false);

  async function addPhotos(files) {
    const selected = [...files].slice(0, 5);
    if (!selected.length) return;
    setPhotoBusy(true);
    const photos = await Promise.all(selected.map(resizePhoto));
    setDraft((current) => ({ ...current, photos: [...(current.photos || []), ...photos] }));
    setPhotoBusy(false);
  }

  function save() {
    onSave({
      ...draft,
      relationPath: draft.relationPathText.split(">").map((item) => item.trim()).filter(Boolean),
      tags: draft.tagsText.split(",").map((item) => item.trim()).filter(Boolean),
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-panel large">
        <header>
          <div>
            <p className="eyebrow">{modal.mode === "new" ? "Alta" : "Edicion"}</p>
            <h2>{draft.name || "Producto"}</h2>
          </div>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="form-grid">
          <label>
            Nombre
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            SKU
            <input value={draft.sku || ""} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} />
          </label>
          <label>
            Tipo
            <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>
              {["Pez", "Alimento", "Material filtrante", "Cuidado", "Equipo", "Producto"].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>
            Unidad
            <input value={draft.unit || ""} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
          </label>
          <label className="wide">
            Ruta
            <input
              value={draft.relationPathText}
              onChange={(event) => setDraft({ ...draft, relationPathText: event.target.value })}
            />
          </label>
          <label>
            Precio
            <input type="number" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
          </label>
          <label>
            Costo
            <input type="number" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} />
          </label>
          <label>
            Stock
            <input type="number" value={draft.stock} onChange={(event) => setDraft({ ...draft, stock: event.target.value })} />
          </label>
          <label>
            Reservado
            <input type="number" value={draft.reserved} onChange={(event) => setDraft({ ...draft, reserved: event.target.value })} />
          </label>
          <label>
            Por llegar
            <input type="number" value={draft.incoming} onChange={(event) => setDraft({ ...draft, incoming: event.target.value })} />
          </label>
          <label>
            Minimo
            <input type="number" value={draft.minStock} onChange={(event) => setDraft({ ...draft, minStock: event.target.value })} />
          </label>
          <label>
            Estado
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              {productStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            URL de imagen
            <input value={draft.imageUrl || ""} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} />
          </label>
          <label className="wide">
            Etiquetas
            <input value={draft.tagsText} onChange={(event) => setDraft({ ...draft, tagsText: event.target.value })} />
          </label>
          <label className="wide">
            Descripcion
            <textarea value={draft.description || ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <label className="wide">
            Notas
            <textarea value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </label>
          <div className="photo-manager wide">
            <div className="photo-strip">
              {firstImage(draft) && <img src={firstImage(draft)} alt={draft.name} />}
              {(draft.photos || []).map((photo) => (
                <img key={photo.id} src={photo.dataUrl} alt={photo.name} />
              ))}
            </div>
            <label className="upload-box">
              <ImagePlus size={18} />
              {photoBusy ? "Procesando" : "Adjuntar fotos"}
              <input type="file" accept="image/*" multiple onChange={(event) => addPhotos(event.target.files)} />
            </label>
          </div>
        </div>
        <footer>
          <button onClick={onClose}>Cancelar</button>
          <button className="primary-action" onClick={save}>
            <Save size={17} />
            Guardar
          </button>
        </footer>
      </section>
    </div>
  );
}

function QuoteModal({ modal, inventory, onClose, onSave }) {
  const [draft, setDraft] = useState(modal.quote);

  function updateLine(lineId, patch) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === lineId ? { ...item, ...patch } : item)),
    }));
  }

  function selectProduct(lineId, productId) {
    const product = inventory.find((item) => item.id === productId);
    if (!product) {
      updateLine(lineId, { productId: "", label: "", unitPrice: 0, relationPath: [], unit: "pieza" });
      return;
    }
    updateLine(lineId, {
      productId,
      label: product.name,
      unitPrice: product.price,
      unit: product.unit,
      relationPath: product.relationPath,
    });
  }

  function addManualLine() {
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        { id: uid("line"), productId: "", label: "", relationPath: [], qty: 1, unit: "pieza", unitPrice: 0, notes: "" },
      ],
    }));
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-panel large">
        <header>
          <div>
            <p className="eyebrow">{draft.number || "Nueva cotizacion"}</p>
            <h2>{draft.customer || "Cliente"}</h2>
          </div>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="form-grid">
          <label>
            Cliente
            <input value={draft.customer} onChange={(event) => setDraft({ ...draft, customer: event.target.value })} />
          </label>
          <label>
            Telefono
            <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          </label>
          <label>
            Email
            <input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
          </label>
          <label>
            Estado
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              {quoteStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Fecha
            <input type="date" value={draft.createdAt} onChange={(event) => setDraft({ ...draft, createdAt: event.target.value })} />
          </label>
          <label>
            Vigencia
            <input type="date" value={draft.validUntil} onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })} />
          </label>
        </div>

        <div className="quote-lines">
          {draft.items.map((line) => (
            <div className="quote-line" key={line.id}>
              <select value={line.productId} onChange={(event) => selectProduct(line.id, event.target.value)}>
                <option value="">Manual</option>
                {inventory.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input
                value={line.label}
                placeholder="Descripcion"
                onChange={(event) => updateLine(line.id, { label: event.target.value })}
              />
              <input
                type="number"
                value={line.qty}
                min="1"
                onChange={(event) => updateLine(line.id, { qty: event.target.value })}
              />
              <input
                type="number"
                value={line.unitPrice}
                onChange={(event) => updateLine(line.id, { unitPrice: event.target.value })}
              />
              <input
                value={line.notes}
                placeholder="Notas"
                onChange={(event) => updateLine(line.id, { notes: event.target.value })}
              />
              <button
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    items: current.items.filter((item) => item.id !== line.id),
                  }))
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button className="small-action" onClick={addManualLine}>
            <Plus size={16} />
            Partida
          </button>
        </div>

        <label className="full-label">
          Notas
          <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>

        <footer>
          <strong className="modal-total">{formatMoney(quoteTotal(draft.items))}</strong>
          <button onClick={onClose}>Cancelar</button>
          <button className="primary-action" onClick={() => onSave(draft)}>
            <Save size={17} />
            Guardar
          </button>
        </footer>
      </section>
    </div>
  );
}

function ArrivalModal({ draft, setDraft, inventory, onClose, onSave }) {
  const selected = inventory.find((item) => item.id === draft.productId);

  return (
    <div className="modal-backdrop">
      <section className="modal-panel">
        <header>
          <div>
            <p className="eyebrow">Llegada</p>
            <h2>{selected?.name || draft.name || "Nuevo registro"}</h2>
          </div>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="form-grid single">
          <label>
            Relacionar inventario
            <select
              value={draft.productId}
              onChange={(event) => {
                const product = inventory.find((item) => item.id === event.target.value);
                setDraft({
                  ...draft,
                  productId: event.target.value,
                  name: product?.name || draft.name,
                  relationPathText: product ? pathLabel(product.relationPath) : draft.relationPathText,
                });
              }}
            >
              <option value="">Nuevo/manual</option>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nombre
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label>
            Ruta
            <input
              value={draft.relationPathText}
              onChange={(event) => setDraft({ ...draft, relationPathText: event.target.value })}
            />
          </label>
          <label>
            Cantidad
            <input type="number" value={draft.qty} onChange={(event) => setDraft({ ...draft, qty: event.target.value })} />
          </label>
          <label>
            ETA
            <input type="date" value={draft.eta} onChange={(event) => setDraft({ ...draft, eta: event.target.value })} />
          </label>
          <label>
            Proveedor
            <input value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} />
          </label>
          <label>
            Apartado
            <input type="number" value={draft.deposit} onChange={(event) => setDraft({ ...draft, deposit: event.target.value })} />
          </label>
          <label>
            Estado
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              {arrivalStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Notas
            <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </label>
        </div>
        <footer>
          <button onClick={onClose}>Cancelar</button>
          <button className="primary-action" onClick={() => onSave(draft)}>
            <Save size={17} />
            Guardar
          </button>
        </footer>
      </section>
    </div>
  );
}
