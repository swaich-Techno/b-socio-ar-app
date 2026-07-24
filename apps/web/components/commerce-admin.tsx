"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CircleAlert,
  Download,
  Edit3,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShoppingBag,
  Store,
  Trash2,
  Utensils,
} from "lucide-react";
import { Badge, Button, Card } from "@bsocio/ui";
import { apiPatch, apiPost, useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard-pages";

interface RestaurantTableRecord {
  _id: string;
  tableNumber: string;
  tableName: string;
  branchId: string;
  section: string;
  capacity: number;
  status: "ACTIVE" | "INACTIVE";
  scanCount: number;
  currentMenuDestination: string;
  internalNotes?: string;
  uniqueQrCode: string;
  qrCreatedAt: string;
}

const emptyTable = {
  tableNumber: "",
  tableName: "",
  branchId: "main",
  section: "",
  capacity: 4,
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  internalNotes: "",
};

function Message({ value, error = false }: { value: string; error?: boolean }) {
  if (!value) return null;
  return <div className={error ? "form-alert" : "form-success"} role={error ? "alert" : "status"}>{value}</div>;
}

function LoadingPanel() {
  return <Card className="empty-state compact"><LoaderCircle className="spin" size={30} /><strong>Loading commerce workspace…</strong></Card>;
}

export function RestaurantTablesAdmin({
  mode = "list",
  tableId,
}: {
  mode?: "list" | "new" | "edit";
  tableId?: string;
}) {
  const endpoint = mode === "edit" && tableId ? `/api/restaurant/tables/${tableId}` : "/api/restaurant/tables";
  const state = useApi<{ items?: RestaurantTableRecord[]; table?: RestaurantTableRecord }>(endpoint);
  const [form, setForm] = useState(emptyTable);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (state.data?.table) {
      const table = state.data.table;
      setForm({
        tableNumber: table.tableNumber,
        tableName: table.tableName,
        branchId: table.branchId,
        section: table.section,
        capacity: table.capacity,
        status: table.status,
        internalNotes: table.internalNotes ?? "",
      });
      setDestination(table.currentMenuDestination);
    }
  }, [state.data]);
  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function save() {
    setBusy("save"); setMessage(""); setError("");
    try {
      if (mode === "edit" && tableId) {
        await apiPatch(`/api/restaurant/tables/${tableId}`, { ...form, currentMenuDestination: destination });
        setMessage("Table details saved. The printed QR code remains unchanged.");
        await state.reload();
      } else {
        await apiPost("/api/restaurant/tables", form);
        setMessage("Table created with its own dynamic QR code.");
        setForm(emptyTable);
        if (mode === "list") await state.reload();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the table.");
    } finally { setBusy(""); }
  }
  async function toggle(table: RestaurantTableRecord) {
    setBusy(`toggle:${table._id}`); setError("");
    try {
      await apiPatch(`/api/restaurant/tables/${table._id}`, { status: table.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      await state.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the table."); }
    finally { setBusy(""); }
  }
  async function remove(table: RestaurantTableRecord) {
    if (!window.confirm(`Delete ${table.tableName}? Only unused tables can be deleted.`)) return;
    setBusy(`delete:${table._id}`); setError("");
    try {
      const response = await fetch(`/api/restaurant/tables/${table._id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to delete the table.");
      await state.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete the table."); }
    finally { setBusy(""); }
  }
  const editing = mode === "new" || mode === "edit";
  return (
    <div className="dashboard-page">
      <PageHeader
        title={mode === "new" ? "Add restaurant table" : mode === "edit" ? "Edit restaurant table" : "Restaurant tables"}
        description="Every table has a stable physical QR code and a validated, temporary ordering session."
        action={!editing ? <Link className="button button-primary" href="/dashboard/restaurant/tables/new"><Plus size={18} /> Add table</Link> : undefined}
      />
      <Message value={message} /><Message value={error || state.error} error />
      {editing ? (
        state.loading && mode === "edit" ? <LoadingPanel /> : (
          <Card className="content-card">
            <div className="content-card-head"><div><h2>Table identity</h2><p className="muted">The table shown here is securely attached to the dining session.</p></div><QrCode size={24} /></div>
            <div className="form-grid">
              <label className="field"><span className="field-label">Table number *</span><input className="input" value={form.tableNumber} onChange={(event) => update("tableNumber", event.target.value)} placeholder="7" /></label>
              <label className="field"><span className="field-label">Visible table name *</span><input className="input" value={form.tableName} onChange={(event) => update("tableName", event.target.value)} placeholder="Table 7" /></label>
              <label className="field"><span className="field-label">Branch ID</span><input className="input" value={form.branchId} onChange={(event) => update("branchId", event.target.value)} placeholder="main" /></label>
              <label className="field"><span className="field-label">Floor or section</span><input className="input" value={form.section} onChange={(event) => update("section", event.target.value)} placeholder="Rooftop" /></label>
              <label className="field"><span className="field-label">Seating capacity *</span><input className="input" type="number" min={1} max={100} value={form.capacity} onChange={(event) => update("capacity", Number(event.target.value))} /></label>
              <label className="field"><span className="field-label">Status</span><select className="input" value={form.status} onChange={(event) => update("status", event.target.value as "ACTIVE" | "INACTIVE")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
              <label className="field form-span"><span className="field-label">Internal notes</span><textarea className="input" value={form.internalNotes} onChange={(event) => update("internalNotes", event.target.value)} placeholder="Visible only to restaurant administrators" /></label>
              {mode === "edit" ? <label className="field form-span"><span className="field-label">Current menu destination</span><input className="input" value={destination} onChange={(event) => setDestination(event.target.value)} /><span className="field-hint">Change the destination without reprinting the physical QR. It must remain inside this restaurant menu.</span></label> : null}
            </div>
            <div className="commerce-form-actions">
              <Button onClick={save} disabled={busy === "save" || !form.tableNumber || !form.tableName}>{busy === "save" ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} {mode === "edit" ? "Save table" : "Create table QR"}</Button>
              <Link className="button button-secondary" href="/dashboard/restaurant/tables">Back to tables</Link>
              {state.data?.table ? <><a className="button button-secondary" href={`/api/restaurant/tables/${state.data.table._id}/qr?format=png`}><Download size={18} /> PNG</a><a className="button button-secondary" href={`/api/restaurant/tables/${state.data.table._id}/qr?format=svg`}><Download size={18} /> SVG</a></> : null}
            </div>
          </Card>
        )
      ) : state.loading ? <LoadingPanel /> : state.data?.items?.length ? (
        <div className="commerce-table-grid">
          {state.data.items.map((table) => (
            <Card className="commerce-table-card" key={table._id}>
              <div className="commerce-table-head">
                <div className="record-icon"><Utensils size={21} /></div>
                <div><h2>{table.tableName}</h2><span>{table.section || "Main floor"} · capacity {table.capacity}</span></div>
                <Badge tone={table.status === "ACTIVE" ? "success" : "warning"}>{table.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="commerce-qr-preview"><Image src={`/api/restaurant/tables/${table._id}/qr?format=svg`} alt={`QR code for ${table.tableName}`} width={1024} height={1024} unoptimized /><span><strong>{table.scanCount.toLocaleString()}</strong> scans</span></div>
              <dl className="commerce-mini-details"><div><dt>Branch</dt><dd>{table.branchId}</dd></div><div><dt>Destination</dt><dd>{table.currentMenuDestination}</dd></div></dl>
              <div className="commerce-card-actions">
                <Link className="button button-secondary" href={`/dashboard/restaurant/tables/${table._id}`}><Edit3 size={17} /> Edit</Link>
                <a className="button button-secondary" href={`/api/restaurant/tables/${table._id}/qr?format=png`}><Download size={17} /> PNG</a>
                <Button variant="ghost" onClick={() => toggle(table)} disabled={busy === `toggle:${table._id}`}><RefreshCw size={17} /> {table.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button>
                {table.scanCount === 0 ? <Button variant="danger" aria-label={`Delete ${table.tableName}`} onClick={() => remove(table)} disabled={busy === `delete:${table._id}`}><Trash2 size={17} /></Button> : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="empty-state"><QrCode size={38} /><strong>No table QR codes yet</strong><span>Create the first table to start secure, table-aware ordering.</span><Link className="button button-primary" href="/dashboard/restaurant/tables/new"><Plus size={18} /> Add first table</Link></Card>
      )}
    </div>
  );
}

interface RestaurantSettingsForm {
  whatsappCountryCode: string;
  whatsappNumber: string;
  defaultOrderLanguage: string;
  currency: string;
  taxPercentage: number;
  serviceChargePercentage: number;
  minimumOrderAmount: number;
  orderAvailability: "ACCEPTING" | "TEMPORARILY_NOT_ACCEPTING" | "CLOSED";
  defaultWhatsappMessage: string;
  tableNumberingFormat: string;
  menuLanguages: string[];
  orderInstructions: string;
  openingHours: string;
  branchNumbers: [];
}
const defaultRestaurantSettings: RestaurantSettingsForm = {
  whatsappCountryCode: "+91", whatsappNumber: "", defaultOrderLanguage: "en", currency: "INR",
  taxPercentage: 0, serviceChargePercentage: 0, minimumOrderAmount: 0,
  orderAvailability: "TEMPORARILY_NOT_ACCEPTING", defaultWhatsappMessage: "",
  tableNumberingFormat: "Table {number}", menuLanguages: ["en"], orderInstructions: "",
  openingHours: "", branchNumbers: [],
};

export function RestaurantSettingsAdmin() {
  const state = useApi<{ settings: Partial<RestaurantSettingsForm> | null }>("/api/restaurant/settings");
  const [form, setForm] = useState(defaultRestaurantSettings);
  const [languages, setLanguages] = useState("en");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (state.data?.settings) {
      setForm((current) => ({ ...current, ...state.data?.settings, branchNumbers: [] }));
      setLanguages(state.data.settings.menuLanguages?.join(", ") || "en");
    }
  }, [state.data]);
  function update<K extends keyof RestaurantSettingsForm>(key: K, value: RestaurantSettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function save() {
    setBusy(true); setMessage(""); setError("");
    try {
      await apiPatch("/api/restaurant/settings", { ...form, menuLanguages: languages.split(",").map((value) => value.trim()).filter(Boolean), branchNumbers: [] });
      setMessage("Restaurant ordering settings saved.");
      await state.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save settings."); }
    finally { setBusy(false); }
  }
  return (
    <div className="dashboard-page">
      <PageHeader title="Restaurant ordering settings" description="Configure the restaurant-owned WhatsApp destination, totals, availability and menu instructions." />
      <Message value={message} /><Message value={error || state.error} error />
      {state.loading ? <LoadingPanel /> : <Card className="content-card">
        <div className="content-card-head"><div><h2>WhatsApp ordering</h2><p className="muted">Numbers are normalized and validated on the server. Customers cannot replace them.</p></div><MessageCircle size={24} /></div>
        <div className="form-grid">
          <label className="field"><span className="field-label">Country calling code *</span><input className="input" value={form.whatsappCountryCode} onChange={(event) => update("whatsappCountryCode", event.target.value)} placeholder="+91" /></label>
          <label className="field"><span className="field-label">Restaurant WhatsApp order number *</span><input className="input" type="tel" value={form.whatsappNumber} onChange={(event) => update("whatsappNumber", event.target.value)} placeholder="9876543210" /></label>
          <label className="field"><span className="field-label">Order availability</span><select className="input" value={form.orderAvailability} onChange={(event) => update("orderAvailability", event.target.value as RestaurantSettingsForm["orderAvailability"])}><option value="ACCEPTING">Accepting WhatsApp orders</option><option value="TEMPORARILY_NOT_ACCEPTING">Temporarily not accepting</option><option value="CLOSED">Closed</option></select></label>
          <label className="field"><span className="field-label">Currency</span><input className="input" value={form.currency} maxLength={3} onChange={(event) => update("currency", event.target.value.toUpperCase())} /></label>
          <label className="field"><span className="field-label">Tax percentage</span><input className="input" type="number" min={0} max={100} step="0.01" value={form.taxPercentage} onChange={(event) => update("taxPercentage", Number(event.target.value))} /></label>
          <label className="field"><span className="field-label">Service charge percentage</span><input className="input" type="number" min={0} max={100} step="0.01" value={form.serviceChargePercentage} onChange={(event) => update("serviceChargePercentage", Number(event.target.value))} /></label>
          <label className="field"><span className="field-label">Minimum order amount</span><input className="input" type="number" min={0} value={form.minimumOrderAmount} onChange={(event) => update("minimumOrderAmount", Number(event.target.value))} /></label>
          <label className="field"><span className="field-label">Default order language</span><input className="input" value={form.defaultOrderLanguage} onChange={(event) => update("defaultOrderLanguage", event.target.value)} /></label>
          <label className="field"><span className="field-label">Menu languages</span><input className="input" value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="en, hi" /></label>
          <label className="field"><span className="field-label">Table numbering format</span><input className="input" value={form.tableNumberingFormat} onChange={(event) => update("tableNumberingFormat", event.target.value)} /></label>
          <label className="field form-span"><span className="field-label">Opening hours</span><textarea className="input" value={form.openingHours} onChange={(event) => update("openingHours", event.target.value)} placeholder="Monday–Sunday, 10:00–23:00" /></label>
          <label className="field form-span"><span className="field-label">Order instructions</span><textarea className="input" value={form.orderInstructions} onChange={(event) => update("orderInstructions", event.target.value)} placeholder="Kitchen and customer guidance shown on the menu" /></label>
          <label className="field form-span"><span className="field-label">Default WhatsApp greeting</span><textarea className="input" value={form.defaultWhatsappMessage} onChange={(event) => update("defaultWhatsappMessage", event.target.value)} placeholder="Leave blank to use “Hello Restaurant Name”" /></label>
        </div>
        <Button onClick={save} disabled={busy || !form.whatsappNumber}>{busy ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} Save ordering settings</Button>
      </Card>}
    </div>
  );
}

interface MenuProfile {
  menuCategory?: string;
  ingredients?: string[];
  allergens?: string[];
  vegetarian?: boolean;
  vegan?: boolean;
  spiceLevel?: number;
  availability?: "AVAILABLE" | "UNAVAILABLE" | "HIDDEN";
  showWhenUnavailable?: boolean;
  servingInformation?: string;
  approximateServingSize?: string;
  imageUrl?: string;
}
interface MenuAdminItem {
  product: { id: string; name: string; description: string; price?: number; currency?: string; slug: string; category: string };
  profile: MenuProfile | null;
}

function MenuItemEditor({ item, reload }: { item: MenuAdminItem; reload(): Promise<void> }) {
  const [profile, setProfile] = useState({
    menuCategory: item.profile?.menuCategory ?? "SPECIALS",
    ingredients: item.profile?.ingredients?.join(", ") ?? "",
    allergens: item.profile?.allergens?.join(", ") ?? "",
    vegetarian: item.profile?.vegetarian ?? false,
    vegan: item.profile?.vegan ?? false,
    spiceLevel: item.profile?.spiceLevel ?? 0,
    availability: item.profile?.availability ?? "AVAILABLE",
    showWhenUnavailable: item.profile?.showWhenUnavailable ?? true,
    servingInformation: item.profile?.servingInformation ?? "",
    approximateServingSize: item.profile?.approximateServingSize ?? "",
    imageUrl: item.profile?.imageUrl ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true); setMessage("");
    try {
      await apiPatch(`/api/restaurant/menu-items/${item.product.id}`, {
        ...profile,
        ingredients: profile.ingredients.split(",").map((value) => value.trim()).filter(Boolean),
        allergens: profile.allergens.split(",").map((value) => value.trim()).filter(Boolean),
      });
      setMessage("Saved");
      await reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Save failed"); }
    finally { setBusy(false); }
  }
  return (
    <Card className="menu-admin-card">
      <div className="commerce-table-head"><div className="record-icon"><Utensils size={20} /></div><div><h2>{item.product.name}</h2><span>{item.product.currency ?? ""} {item.product.price ?? "Price required"}</span></div><Badge tone={profile.availability === "AVAILABLE" ? "success" : profile.availability === "UNAVAILABLE" ? "warning" : "neutral"}>{profile.availability}</Badge></div>
      <div className="form-grid compact-grid">
        <label className="field"><span className="field-label">Menu category</span><select className="input" value={profile.menuCategory} onChange={(event) => setProfile((value) => ({ ...value, menuCategory: event.target.value }))}>{["STARTERS","MAIN_COURSE","DESSERTS","BEVERAGES","BAKERY","COMBOS","SPECIALS"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="field"><span className="field-label">Availability</span><select className="input" value={profile.availability} onChange={(event) => setProfile((value) => ({ ...value, availability: event.target.value as typeof profile.availability }))}><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option><option value="HIDDEN">Hidden</option></select></label>
        <label className="field"><span className="field-label">Ingredients</span><input className="input" value={profile.ingredients} onChange={(event) => setProfile((value) => ({ ...value, ingredients: event.target.value }))} placeholder="Tomato, basil, mozzarella" /></label>
        <label className="field"><span className="field-label">Allergens</span><input className="input" value={profile.allergens} onChange={(event) => setProfile((value) => ({ ...value, allergens: event.target.value }))} placeholder="Milk, gluten" /></label>
        <label className="field"><span className="field-label">Spice level (0–5)</span><input className="input" type="number" min={0} max={5} value={profile.spiceLevel} onChange={(event) => setProfile((value) => ({ ...value, spiceLevel: Number(event.target.value) }))} /></label>
        <label className="field"><span className="field-label">Serving information</span><input className="input" value={profile.servingInformation} onChange={(event) => setProfile((value) => ({ ...value, servingInformation: event.target.value }))} /></label>
      </div>
      <div className="commerce-checks"><label className="check-row"><input type="checkbox" checked={profile.vegetarian} onChange={(event) => setProfile((value) => ({ ...value, vegetarian: event.target.checked }))} /> Vegetarian</label><label className="check-row"><input type="checkbox" checked={profile.vegan} onChange={(event) => setProfile((value) => ({ ...value, vegan: event.target.checked }))} /> Vegan</label><label className="check-row"><input type="checkbox" checked={profile.showWhenUnavailable} onChange={(event) => setProfile((value) => ({ ...value, showWhenUnavailable: event.target.checked }))} /> Show when unavailable</label></div>
      <div className="commerce-form-actions"><Button onClick={save} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} Save menu item</Button>{message ? <span className="muted" role="status">{message}</span> : null}</div>
    </Card>
  );
}

export function RestaurantMenuAdmin() {
  const state = useApi<{ items: MenuAdminItem[] }>("/api/restaurant/menu-items");
  return <div className="dashboard-page"><PageHeader title="Restaurant menu" description="Set menu categories, ingredients, allergens, dietary badges and live availability." />{state.error ? <Message value={state.error} error /> : null}{state.loading ? <LoadingPanel /> : state.data?.items.length ? <div className="commerce-table-grid">{state.data.items.map((item) => <MenuItemEditor key={item.product.id} item={item} reload={state.reload} />)}</div> : <Card className="empty-state"><ShoppingBag size={36} /><strong>No products to configure</strong><span>Add products and publish their AR experiences before launching the menu.</span><Link className="button button-primary" href="/dashboard/products/new"><Plus size={18} /> Add product</Link></Card>}</div>;
}

export function RestaurantOrdersAdmin() {
  const state = useApi<{ items: Array<{ _id: string; orderId: string; status: string; estimatedTotal: number; currency: string; items: Array<{ productNameSnapshot: string; quantity: number }>; table?: { tableName?: string }; updatedAt: string }> }>("/api/restaurant/orders");
  return <div className="dashboard-page"><PageHeader title="WhatsApp order activity" description="Orders shown here were prepared or opened in WhatsApp. They are not confirmed sales." />{state.error ? <Message value={state.error} error /> : null}{state.loading ? <LoadingPanel /> : state.data?.items.length ? <div className="record-grid">{state.data.items.map((item) => <Card className="content-card" key={item._id}><div className="record-title"><strong>{item.orderId}</strong><Badge tone={item.status === "DRAFT" ? "neutral" : "info"}>{item.status.replaceAll("_", " ")}</Badge></div><p><strong>{item.table?.tableName ?? "Table"}</strong> · {item.items.reduce((sum, product) => sum + product.quantity, 0)} items</p><div className="commerce-total-row"><span>Estimated total</span><strong>{new Intl.NumberFormat(undefined, { style: "currency", currency: item.currency }).format(item.estimatedTotal)}</strong></div><small className="muted">Updated {new Date(item.updatedAt).toLocaleString()}</small></Card>)}</div> : <Card className="empty-state"><MessageCircle size={36} /><strong>No WhatsApp order activity yet</strong><span>Activity appears after a customer prepares an order from a table session.</span></Card>}</div>;
}

export function CommerceAnalyticsAdmin({ kind }: { kind: "restaurant" | "jewellery" }) {
  const state = useApi<{ summary: Record<string, number>; disclaimer: string }>(`/api/${kind}/analytics`);
  return <div className="dashboard-page"><PageHeader title={`${kind === "restaurant" ? "Restaurant" : "Jewellery"} commerce analytics`} description={kind === "restaurant" ? "Table sessions, menu intent, AR engagement and WhatsApp order initiation." : "Try-on engagement and enquiry intent without claiming unverified sales."} />{state.error ? <Message value={state.error} error /> : null}{state.loading ? <LoadingPanel /> : state.data ? <><div className="metric-grid">{Object.entries(state.data.summary).slice(0, 12).map(([label, value]) => <Card className="metric-card" key={label}><span>{label.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2")}</span><strong>{Number(value).toLocaleString()}</strong><small>Recorded activity</small></Card>)}</div><div className="commerce-disclaimer"><CircleAlert size={19} /><span>{state.data.disclaimer}</span></div></> : null}</div>;
}

interface JewellerySettingsForm {
  whatsappCountryCode: string;
  whatsappNumber: string;
  defaultEnquiryMessage: string;
  appointmentContact: string;
  productWebsite: string;
  storeAddress: string;
  businessHours: string;
  branchNumbers: [];
}
const defaultJewellerySettings: JewellerySettingsForm = { whatsappCountryCode: "+91", whatsappNumber: "", defaultEnquiryMessage: "", appointmentContact: "", productWebsite: "", storeAddress: "", businessHours: "", branchNumbers: [] };

export function JewellerySettingsAdmin() {
  const state = useApi<{ settings: Partial<JewellerySettingsForm> | null }>("/api/jewellery/settings");
  const [form, setForm] = useState(defaultJewellerySettings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (state.data?.settings) setForm((current) => ({ ...current, ...state.data?.settings, branchNumbers: [] })); }, [state.data]);
  function update<K extends keyof JewellerySettingsForm>(key: K, value: JewellerySettingsForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function save() { setBusy(true); setMessage(""); setError(""); try { await apiPatch("/api/jewellery/settings", form); setMessage("Jewellery enquiry settings saved."); await state.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save settings."); } finally { setBusy(false); } }
  return <div className="dashboard-page"><PageHeader title="Jewellery enquiry settings" description="Use this business’s own WhatsApp sales number for product enquiries and appointments." /><Message value={message} /><Message value={error || state.error} error />{state.loading ? <LoadingPanel /> : <Card className="content-card"><div className="content-card-head"><div><h2>Sales contact</h2><p className="muted">The server owns this number; customer input can never replace it.</p></div><Store size={24} /></div><div className="form-grid"><label className="field"><span className="field-label">Country calling code *</span><input className="input" value={form.whatsappCountryCode} onChange={(event) => update("whatsappCountryCode", event.target.value)} /></label><label className="field"><span className="field-label">WhatsApp sales number *</span><input className="input" type="tel" value={form.whatsappNumber} onChange={(event) => update("whatsappNumber", event.target.value)} /></label><label className="field"><span className="field-label">Appointment contact</span><input className="input" value={form.appointmentContact} onChange={(event) => update("appointmentContact", event.target.value)} /></label><label className="field"><span className="field-label">Product website</span><input className="input" type="url" value={form.productWebsite} onChange={(event) => update("productWebsite", event.target.value)} /></label><label className="field form-span"><span className="field-label">Store address</span><textarea className="input" value={form.storeAddress} onChange={(event) => update("storeAddress", event.target.value)} /></label><label className="field form-span"><span className="field-label">Business hours</span><textarea className="input" value={form.businessHours} onChange={(event) => update("businessHours", event.target.value)} /></label><label className="field form-span"><span className="field-label">Default enquiry greeting</span><textarea className="input" value={form.defaultEnquiryMessage} onChange={(event) => update("defaultEnquiryMessage", event.target.value)} /></label></div><Button onClick={save} disabled={busy || !form.whatsappNumber}>{busy ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} Save enquiry settings</Button></Card>}</div>;
}

export function JewelleryEnquiriesAdmin() {
  const state = useApi<{ items: Array<{ _id: string; enquiryType: string; customerName?: string; selectedVariant?: string; preferredDate?: string; status: string; createdAt: string }> }>("/api/jewellery/enquiries");
  return <div className="dashboard-page"><PageHeader title="Jewellery enquiries" description="Track enquiry initiation separately from business contact and completed sales." />{state.error ? <Message value={state.error} error /> : null}{state.loading ? <LoadingPanel /> : state.data?.items.length ? <div className="record-grid">{state.data.items.map((item) => <Card className="content-card" key={item._id}><div className="record-title"><strong>{item.enquiryType.replaceAll("_", " ")}</strong><Badge tone="info">{item.status.replaceAll("_", " ")}</Badge></div><p>{item.customerName || "Anonymous customer"}{item.selectedVariant ? ` · ${item.selectedVariant}` : ""}</p>{item.preferredDate ? <p className="muted"><MapPin size={15} /> Preferred {item.preferredDate}</p> : null}<small className="muted">Initiated {new Date(item.createdAt).toLocaleString()}</small></Card>)}</div> : <Card className="empty-state"><MessageCircle size={36} /><strong>No enquiry activity yet</strong><span>Leads appear when a shopper starts a WhatsApp enquiry.</span></Card>}</div>;
}
