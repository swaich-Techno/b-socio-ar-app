"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Box,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  LoaderCircle,
  Minus,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { Badge, Button, Card } from "@bsocio/ui";
import { Brand } from "@/components/brand";

interface MenuItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  productCategory: string;
  imageUrl: string;
  ingredients: string[];
  allergens: string[];
  vegetarian: boolean;
  vegan: boolean;
  spiceLevel: number;
  availability: "AVAILABLE" | "UNAVAILABLE";
  servingInformation: string;
  approximateServingSize: string;
  price?: number;
  currency: string;
  view3dPath: string;
}
interface MenuPayload {
  business: { name: string; slug: string; primaryColour: string; website: string };
  table: { id: string; number: string; name: string; section?: string } | null;
  sessionActive: boolean;
  settings: { currency: string; orderAvailability: string; openingHours: string; orderInstructions: string };
  categories: string[];
  items: MenuItem[];
}
interface CartItem {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  instructions: string;
}
interface CartPayload {
  cart: {
    orderId: string;
    items: CartItem[];
    subtotal: number;
    tax: number;
    serviceCharge: number;
    estimatedTotal: number;
    currency: string;
    orderNote: string;
    customerName: string;
    status: string;
  };
  table: { id: string; number: string; name: string };
  restaurant: { name: string; slug: string };
  orderAvailability: string;
}
interface WhatsappPayload {
  whatsappUrl: string;
  callUrl: string;
  phoneNumber: string;
  message: string;
  orderId: string;
  notice: string;
  statusLabel: string;
}

async function commerceRequest<T>(
  path: string,
  sessionToken: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(path, {
    method: options?.method ?? "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(sessionToken ? { "x-dining-session": sessionToken } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The request could not be completed.");
  return payload.data;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

export function RestaurantMenu({
  businessSlug,
  sessionToken,
}: {
  businessSlug: string;
  sessionToken: string;
}) {
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState<WhatsappPayload | null>(null);

  async function loadCart() {
    if (!menu?.sessionActive && !sessionToken) return;
    try {
      setCart(await commerceRequest<CartPayload>("/api/restaurant/cart", sessionToken));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load your cart.");
    }
  }
  useEffect(() => {
    let cancelled = false;
    const path = `/api/public/restaurant/menu/${businessSlug}${sessionToken ? `?session=${encodeURIComponent(sessionToken)}` : ""}`;
    commerceRequest<MenuPayload>(path, sessionToken)
      .then((data) => { if (!cancelled) setMenu(data); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "This menu is unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [businessSlug, sessionToken]);
  useEffect(() => {
    if (menu?.sessionActive) void loadCart();
    // loadCart intentionally follows the validated menu session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.sessionActive]);
  useEffect(() => {
    if (location.hash === "#cart") setCartOpen(true);
  }, []);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return menu?.items.filter((item) =>
      (category === "ALL" || item.category === category) &&
      (!term || `${item.name} ${item.description} ${item.ingredients.join(" ")}`.toLowerCase().includes(term))
    ) ?? [];
  }, [category, menu, search]);
  const itemCount = cart?.cart.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const total = cart?.cart.estimatedTotal ?? 0;

  async function setQuantity(item: MenuItem | CartItem, quantity: number, instructions = "") {
    const productId = "id" in item ? item.id : String(item.productId);
    if (!menu?.sessionActive) {
      setError("Scan a table QR code before placing an order. The table number will never be invented.");
      return;
    }
    setBusy(productId); setError("");
    try {
      const data = await commerceRequest<{ cart: CartPayload["cart"] }>("/api/restaurant/cart/items", sessionToken, {
        method: "POST",
        body: { productId, quantity, instructions },
      });
      setCart((current) => current ? { ...current, cart: data.cart } : current);
      setStatus(quantity === 0 ? "Item removed" : "Order updated");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the order."); }
    finally { setBusy(""); }
  }

  async function prepareWhatsapp() {
    setBusy("whatsapp"); setError(""); setFallback(null);
    const popup = window.open("", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "Opening WhatsApp";
      popup.document.body.textContent = "Preparing your order for WhatsApp…";
    }
    try {
      const details = {
        orderNote: cart?.cart.orderNote ?? "",
        customerName: cart?.cart.customerName ?? "",
      };
      const data = await commerceRequest<WhatsappPayload>("/api/restaurant/cart/whatsapp", sessionToken, { method: "POST", body: details });
      setFallback(data);
      setStatus("Order prepared for WhatsApp");
      setConfirmOpen(false);
      if (popup) popup.location.href = data.whatsappUrl;
      else window.location.href = data.whatsappUrl;
      await loadCart();
    } catch (reason) {
      popup?.close();
      setError(reason instanceof Error ? reason.message : "WhatsApp could not be opened. Your order details are still available below.");
    } finally { setBusy(""); }
  }

  async function saveCartDetails(key: "orderNote" | "customerName", value: string) {
    if (!cart) return;
    const next = { ...cart.cart, [key]: value };
    setCart({ ...cart, cart: next });
    try {
      await commerceRequest("/api/restaurant/cart", sessionToken, {
        method: "PATCH",
        body: { orderNote: next.orderNote, customerName: next.customerName },
      });
    } catch { setError("Your note could not be saved. Please try again."); }
  }

  if (loading) return <main className="menu-loading"><LoaderCircle className="spin" size={36} /><strong>Opening the restaurant menu…</strong></main>;
  if (!menu) return <main className="commerce-status-page"><Brand /><Card className="commerce-status-card"><CircleAlert size={40} /><h1>Menu unavailable</h1><p>{error || "This menu could not be loaded."}</p><Link className="button button-primary" href="/">Visit B Socio AR</Link></Card></main>;

  return (
    <main className="restaurant-menu" id="main-content" style={{ "--business-colour": menu.business.primaryColour } as React.CSSProperties}>
      <header className="menu-header">
        <div className="menu-brand"><div className="menu-logo"><Utensils size={24} /></div><div><span>Welcome to</span><strong>{menu.business.name}</strong></div></div>
        {menu.table ? <div className="table-identity"><span>You are ordering from</span><strong>{menu.table.name}</strong></div> : <Badge tone="warning">Browse-only menu</Badge>}
      </header>
      <section className="menu-hero">
        <div><span className="eyebrow">Mobile menu · 3D · table AR</span><h1>{menu.table ? `Ready at ${menu.table.name}` : "Explore the menu"}</h1><p>{menu.settings.orderInstructions || "View dishes in 3D, place them on your table and build your order."}</p></div>
        {menu.settings.openingHours ? <div className="opening-hours"><strong>Opening hours</strong><span>{menu.settings.openingHours}</span></div> : null}
      </section>
      {!menu.sessionActive ? <div className="menu-session-alert"><CircleAlert size={20} /><div><strong>Scan a table QR to order</strong><span>You can browse and view AR now, but a validated table session is required before adding items.</span></div></div> : null}
      {menu.settings.orderAvailability !== "ACCEPTING" ? <div className="menu-session-alert warning"><CircleAlert size={20} /><div><strong>WhatsApp ordering is currently unavailable</strong><span>The menu remains available to browse.</span></div></div> : null}
      {error ? <div className="menu-error" role="alert">{error}</div> : null}
      {status ? <div className="menu-status" role="status"><Check size={17} /> {status}</div> : null}
      <div className="menu-toolbar">
        <label className="menu-search"><Search size={19} /><span className="sr-only">Search menu</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes or ingredients" /></label>
        <div className="menu-categories" aria-label="Menu categories">
          {["ALL", ...menu.categories].map((value) => <button type="button" className={category === value ? "active" : ""} onClick={() => setCategory(value)} key={value}>{value.replaceAll("_", " ")}</button>)}
        </div>
      </div>
      <section className="menu-grid" aria-live="polite">
        {visibleItems.map((item) => {
          const existing = cart?.cart.items.find((cartItem) => String(cartItem.productId) === item.id);
          return (
            <Card className="menu-item-card" key={item.id}>
              <div className="menu-item-image">
                {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} fill sizes="(max-width: 720px) 100vw, 33vw" unoptimized /> : <div className="menu-image-placeholder"><Sparkles size={32} /><span>3D-ready dish</span></div>}
                {item.availability !== "AVAILABLE" ? <Badge tone="warning">Unavailable</Badge> : null}
              </div>
              <div className="menu-item-copy">
                <div className="menu-item-title"><div><span>{item.category.replaceAll("_", " ")}</span><h2>{item.name}</h2></div>{item.price !== undefined ? <strong>{money(item.price, item.currency)}</strong> : null}</div>
                <p>{item.description}</p>
                <div className="food-badges">{item.vegetarian ? <Badge tone="success">Vegetarian</Badge> : null}{item.vegan ? <Badge tone="success">Vegan</Badge> : null}{item.spiceLevel > 0 ? <Badge tone="warning">Spice {item.spiceLevel}/5</Badge> : null}</div>
                {item.ingredients.length ? <details><summary>Ingredients <ChevronDown size={16} /></summary><p>{item.ingredients.join(", ")}</p></details> : null}
                {item.allergens.length ? <p className="allergen-line"><CircleAlert size={16} /> Allergens: {item.allergens.join(", ")}</p> : null}
                <div className="menu-item-actions">
                  <Link className="button button-secondary" href={`${item.view3dPath}${sessionToken ? `?session=${encodeURIComponent(sessionToken)}` : ""}`}><Box size={18} /> View in 3D</Link>
                  <Link className="button button-secondary" href={`${item.view3dPath}${sessionToken ? `?session=${encodeURIComponent(sessionToken)}&launch=ar` : "?launch=ar"}`}><Sparkles size={18} /> View on your table</Link>
                  {existing ? <div className="quantity-control"><button type="button" aria-label={`Reduce ${item.name}`} onClick={() => setQuantity(item, Math.max(0, existing.quantity - 1), existing.instructions)}><Minus size={17} /></button><strong>{existing.quantity}</strong><button type="button" aria-label={`Add another ${item.name}`} onClick={() => setQuantity(item, existing.quantity + 1, existing.instructions)}><Plus size={17} /></button></div> : <Button disabled={busy === item.id || item.availability !== "AVAILABLE" || item.price === undefined} onClick={() => setQuantity(item, 1)}>{busy === item.id ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />} Add to order</Button>}
                </div>
              </div>
            </Card>
          );
        })}
        {!visibleItems.length ? <Card className="empty-state"><Search size={34} /><strong>No matching menu items</strong><span>Try a different search or category.</span></Card> : null}
      </section>

      <div className={`cart-drawer ${cartOpen ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Your table order">
        <div className="cart-drawer-head"><div><span>Your order</span><strong>{menu.table?.name ?? "Table required"}</strong></div><button type="button" aria-label="Close cart" onClick={() => setCartOpen(false)}><X size={21} /></button></div>
        <div className="cart-items">
          {cart?.cart.items.length ? cart.cart.items.map((item) => (
            <div className="cart-item" key={String(item.productId)}>
              <div className="cart-item-title"><strong>{item.productNameSnapshot}</strong><span>{money(item.totalPrice, cart.cart.currency)}</span></div>
              <div className="cart-item-controls"><div className="quantity-control"><button type="button" aria-label={`Reduce ${item.productNameSnapshot}`} onClick={() => setQuantity(item, Math.max(0, item.quantity - 1), item.instructions)}><Minus size={17} /></button><strong>{item.quantity}</strong><button type="button" aria-label={`Add another ${item.productNameSnapshot}`} onClick={() => setQuantity(item, item.quantity + 1, item.instructions)}><Plus size={17} /></button></div><Button variant="ghost" onClick={() => setQuantity(item, 0)}><X size={17} /> Remove</Button></div>
              <label className="field"><span className="field-label">Item instructions</span><input className="input" defaultValue={item.instructions} onBlur={(event) => setQuantity(item, item.quantity, event.target.value)} placeholder="No onions, less spicy…" /></label>
            </div>
          )) : <div className="empty-state compact"><ShoppingBag size={30} /><strong>Your order is empty</strong><span>Add dishes from the menu.</span></div>}
        </div>
        {cart ? <div className="cart-summary">
          <label className="field"><span className="field-label">Customer name (optional)</span><input className="input" value={cart.cart.customerName} onChange={(event) => setCart({ ...cart, cart: { ...cart.cart, customerName: event.target.value } })} onBlur={(event) => saveCartDetails("customerName", event.target.value)} /></label>
          <label className="field"><span className="field-label">Complete-order instructions</span><textarea className="input" value={cart.cart.orderNote} onChange={(event) => setCart({ ...cart, cart: { ...cart.cart, orderNote: event.target.value } })} onBlur={(event) => saveCartDetails("orderNote", event.target.value)} placeholder="Please serve drinks first…" /></label>
          <dl><div><dt>Subtotal</dt><dd>{money(cart.cart.subtotal, cart.cart.currency)}</dd></div>{cart.cart.tax > 0 ? <div><dt>Tax</dt><dd>{money(cart.cart.tax, cart.cart.currency)}</dd></div> : null}{cart.cart.serviceCharge > 0 ? <div><dt>Service charge</dt><dd>{money(cart.cart.serviceCharge, cart.cart.currency)}</dd></div> : null}<div className="cart-total"><dt>Estimated total</dt><dd>{money(cart.cart.estimatedTotal, cart.cart.currency)}</dd></div></dl>
          <Button onClick={() => setConfirmOpen(true)} disabled={!cart.cart.items.length || menu.settings.orderAvailability !== "ACCEPTING"}><MessageCircleIcon /> Order on WhatsApp</Button>
          <p className="cart-disclaimer">Opening WhatsApp initiates an order message. It does not confirm acceptance by the restaurant.</p>
        </div> : null}
      </div>
      {cartOpen ? <button type="button" className="commerce-scrim" aria-label="Close cart" onClick={() => setCartOpen(false)} /> : null}

      {confirmOpen ? <div className="commerce-modal" role="dialog" aria-modal="true" aria-labelledby="whatsapp-confirm-title"><Card><button className="modal-close" type="button" aria-label="Close" onClick={() => setConfirmOpen(false)}><X size={20} /></button><MessageCircleIcon large /><h2 id="whatsapp-confirm-title">Ready to open WhatsApp?</h2><p>Your order details are ready. WhatsApp will open so you can send the order directly to the restaurant.</p><div className="commerce-form-actions"><Button onClick={prepareWhatsapp} disabled={busy === "whatsapp"}>{busy === "whatsapp" ? <LoaderCircle className="spin" size={18} /> : <ExternalWhatsAppIcon />} Continue to WhatsApp</Button><Button variant="secondary" onClick={() => setConfirmOpen(false)}>Review order</Button></div></Card></div> : null}
      {fallback ? <div className="whatsapp-fallback"><div><strong>Order prepared for WhatsApp</strong><span>If WhatsApp did not open, your order is still available.</span></div><a className="button button-primary" href={fallback.whatsappUrl}>Open WhatsApp</a><Button variant="secondary" onClick={() => navigator.clipboard.writeText(fallback.message)}><Copy size={18} /> Copy order</Button><a className="button button-secondary" href={fallback.callUrl}><Phone size={18} /> Call {fallback.phoneNumber}</a></div> : null}

      <nav className="commerce-sticky-bar" aria-label="Order actions">
        <button type="button" className="sticky-cart" onClick={() => setCartOpen(true)}><ShoppingBag size={20} /><span><strong>View cart · {itemCount} {itemCount === 1 ? "item" : "items"}</strong><small>{menu.table?.name ?? "Scan a table QR"}</small></span></button>
        <button type="button" className="sticky-total" onClick={() => itemCount ? setConfirmOpen(true) : setCartOpen(true)} disabled={!menu.sessionActive}><span>{money(total, cart?.cart.currency ?? menu.settings.currency)}</span><strong>Order on WhatsApp</strong></button>
      </nav>
    </main>
  );
}

function MessageCircleIcon({ large = false }: { large?: boolean }) {
  return <svg width={large ? 42 : 19} height={large ? 42 : 19} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20l1.2-4.5A8.5 8.5 0 1 1 20.5 11.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M8.7 8.4c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.6.7c-.2.2-.1.4 0 .6.7 1.2 1.7 2.1 2.9 2.6.3.1.5.1.7-.1l.8-1c.2-.2.4-.3.7-.2l1.8.8c.3.1.4.3.4.6 0 .5-.2 1.2-.6 1.6-.5.5-1.3.8-2.2.6-1.5-.3-3.5-1.2-5.2-2.8-1.4-1.3-2.5-3.1-2.8-4.5-.2-.7 0-1.1.2-1.4Z" fill="currentColor" /></svg>;
}

function ExternalWhatsAppIcon() {
  return <><MessageCircleIcon /><span>Send order</span></>;
}
