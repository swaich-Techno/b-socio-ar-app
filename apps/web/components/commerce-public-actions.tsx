"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Camera,
  Check,
  Copy,
  Download,
  Gem,
  LoaderCircle,
  MessageCircle,
  Phone,
  RefreshCcw,
  Ruler,
  Share2,
  ShoppingBag,
  Store,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { Badge, Button, Card } from "@bsocio/ui";

interface FoodActionsProps {
  businessSlug: string;
  productId: string;
  productName: string;
  price?: number;
  currency?: string;
  sessionToken: string;
  sessionActive: boolean;
  tableName?: string;
}

async function sessionRequest<T>(path: string, sessionToken: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(sessionToken ? { "x-dining-session": sessionToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The action could not be completed.");
  return payload.data;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

export function FoodCommerceActions(props: FoodActionsProps) {
  const [cart, setCart] = useState<{ items: Array<{ productId: string; quantity: number }>; estimatedTotal: number; currency: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!props.sessionActive) return;
    sessionRequest<{ cart: typeof cart }>("/api/restaurant/cart", props.sessionToken)
      .then((data) => setCart(data.cart))
      .catch(() => setCart(null));
  }, [props.sessionActive, props.sessionToken]);
  const currentQuantity = cart?.items.find((item) => String(item.productId) === props.productId)?.quantity ?? 0;
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  async function add() {
    if (!props.sessionActive) {
      setError("Scan a table QR code before placing an order. The table number cannot be entered manually.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await sessionRequest<{ cart: NonNullable<typeof cart> }>("/api/restaurant/cart/items", props.sessionToken, "POST", {
        productId: props.productId,
        quantity: currentQuantity + 1,
        instructions: "",
      });
      setCart(data.cart);
      setMessage(`${props.productName} added to your table order.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add this item."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <div className="commerce-product-actions">
        {props.sessionActive ? <Badge tone="success">Ordering from {props.tableName}</Badge> : <Badge tone="warning">Table session required to order</Badge>}
        {error ? <div className="menu-error" role="alert">{error}</div> : null}
        {message ? <div className="menu-status" role="status"><Check size={17} /> {message}</div> : null}
        <div className="ar-actions">
          <Button onClick={add} disabled={busy || props.price === undefined}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShoppingBag size={18} />} Add to order</Button>
          <Link className="button button-secondary" href={`/menu/${props.businessSlug}${props.sessionToken ? `?session=${encodeURIComponent(props.sessionToken)}` : ""}#cart`}>View cart</Link>
          <Link className="button button-ghost" href={`/menu/${props.businessSlug}${props.sessionToken ? `?session=${encodeURIComponent(props.sessionToken)}` : ""}`}>Return to menu</Link>
        </div>
        <p className="ar-portion-note">AR portion size is an approximate visual representation.</p>
      </div>
      <nav className="commerce-sticky-bar ar-commerce-bar" aria-label="Food ordering actions">
        <button type="button" className="sticky-cart" onClick={add} disabled={!props.sessionActive || busy}><ShoppingBag size={20} /><span><strong>Add to order</strong><small>{props.tableName ?? "Scan a table QR first"}</small></span></button>
        <Link className="sticky-total" href={`/menu/${props.businessSlug}${props.sessionToken ? `?session=${encodeURIComponent(props.sessionToken)}` : ""}#cart`}><span>{money(cart?.estimatedTotal ?? 0, cart?.currency ?? props.currency ?? "INR")}</span><strong>View cart · {itemCount}</strong></Link>
      </nav>
    </>
  );
}

type EnquiryType = "PRICE_ENQUIRY" | "AVAILABILITY_ENQUIRY" | "CUSTOM_SIZE_REQUEST" | "STORE_VISIT" | "VIDEO_CALL" | "DELIVERY_ENQUIRY" | "PRODUCT_RESERVATION" | "GENERAL_ENQUIRY";
interface JewelleryActionsProps {
  businessSlug: string;
  businessName: string;
  productSlug: string;
  productName: string;
  variants: string[];
  screenshotUrl: string;
  onCapture(): Promise<void>;
  onRetake(): Promise<void>;
  onDeleteCapture(): void;
  onStartCamera(): Promise<void>;
  cameraActive: boolean;
}
interface JewelleryResponse {
  enquiryId: string;
  status: string;
  statusLabel: string;
  whatsappUrl?: string;
  callUrl?: string;
  phoneNumber?: string;
  websiteUrl?: string;
  message: string;
  instruction: string;
}

const actionLabels: Array<[EnquiryType, string, typeof Gem]> = [
  ["GENERAL_ENQUIRY", "Enquire on WhatsApp", MessageCircle],
  ["PRICE_ENQUIRY", "Ask price on WhatsApp", Gem],
  ["AVAILABILITY_ENQUIRY", "Check availability", Check],
  ["STORE_VISIT", "Book store visit", Store],
  ["VIDEO_CALL", "Request video call", Video],
  ["CUSTOM_SIZE_REQUEST", "Custom size request", Ruler],
];

export function JewelleryCommerceActions(props: JewelleryActionsProps) {
  const [type, setType] = useState<EnquiryType>("GENERAL_ENQUIRY");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<JewelleryResponse | null>(null);
  const [captureNotice, setCaptureNotice] = useState(false);
  const [attachReference, setAttachReference] = useState(false);
  const [form, setForm] = useState({
    branchId: "main", branchName: "", tryOnProfileId: "", customerName: "", customerMobile: "",
    customerCountryCode: "", customerCountry: "", customerTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    selectedHand: "" as "" | "LEFT" | "RIGHT", selectedFinger: "", selectedVariant: "", requestedSize: "",
    preferredDate: "", preferredTime: "", customerNote: "",
  });
  function begin(nextType: EnquiryType) { setType(nextType); setOpen(true); setError(""); setResult(null); }
  async function submit() {
    setBusy(true); setError("");
    const popup = window.open("", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "Opening WhatsApp";
      popup.document.body.textContent = "Preparing your jewellery enquiry…";
    }
    try {
      const data = await sessionRequest<JewelleryResponse>("/api/jewellery/enquiries/whatsapp", "", "POST", {
        businessSlug: props.businessSlug,
        productSlug: props.productSlug,
        enquiryType: type,
        ...form,
        customerNote: `${form.customerNote}${attachReference ? `${form.customerNote ? "\n" : ""}I have saved a try-on image and may attach it in WhatsApp.` : ""}`,
      });
      setResult(data);
      if (data.whatsappUrl) {
        if (popup) popup.location.href = data.whatsappUrl;
        else window.location.href = data.whatsappUrl;
      } else {
        popup?.close();
        setError("WhatsApp could not be opened. You can copy the enquiry or call the store.");
      }
    } catch (reason) {
      popup?.close();
      setError(reason instanceof Error ? reason.message : "WhatsApp could not be opened. You can copy the enquiry or call the store.");
    } finally { setBusy(false); }
  }
  async function shareScreenshot() {
    if (!props.screenshotUrl) return;
    const blob = await (await fetch(props.screenshotUrl)).blob();
    const file = new File([blob], `${props.productSlug}-try-on.png`, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${props.productName} try-on` });
    } else {
      const anchor = document.createElement("a");
      anchor.href = props.screenshotUrl;
      anchor.download = `${props.productSlug}-try-on.png`;
      anchor.click();
    }
  }
  return (
    <>
      <section className="jewellery-commerce">
        <div className="content-card-head"><div><span className="eyebrow">Private, business-direct enquiry</span><h2>Interested in this piece?</h2><p className="muted">Your message goes to {props.businessName}’s configured sales number.</p></div><Gem size={26} /></div>
        <div className="jewellery-action-grid">{actionLabels.map(([value, label, Icon]) => <Button key={value} variant={value === "GENERAL_ENQUIRY" ? "primary" : "secondary"} onClick={() => begin(value)}><Icon size={18} /> {label}</Button>)}</div>
        <Card className="tryon-capture-card">
          <div><Camera size={23} /><span><strong>Try-on screenshot</strong><small>Saved locally unless you choose to share it.</small></span></div>
          {!props.cameraActive ? <Button variant="secondary" onClick={props.onStartCamera}><Camera size={18} /> Start camera preview</Button> : !props.screenshotUrl ? <Button variant="secondary" onClick={() => setCaptureNotice(true)}><Camera size={18} /> Capture preview</Button> : null}
          {props.screenshotUrl ? <div className="tryon-capture-result"><Image src={props.screenshotUrl} alt={`Captured try-on preview for ${props.productName}`} width={720} height={960} unoptimized /><div className="commerce-form-actions"><Button variant="secondary" onClick={props.onRetake}><RefreshCcw size={18} /> Retake</Button><a className="button button-secondary" href={props.screenshotUrl} download={`${props.productSlug}-try-on.png`}><Download size={18} /> Download</a><Button variant="secondary" onClick={shareScreenshot}><Share2 size={18} /> Share</Button><Button variant="danger" onClick={props.onDeleteCapture}><Trash2 size={18} /> Delete</Button></div></div> : null}
        </Card>
      </section>
      {captureNotice ? <div className="commerce-modal" role="dialog" aria-modal="true" aria-labelledby="capture-title"><Card><button className="modal-close" type="button" aria-label="Close" onClick={() => setCaptureNotice(false)}><X size={20} /></button><Camera size={38} /><h2 id="capture-title">Capture this preview?</h2><p>This will create a still image from your camera preview. It will not be uploaded unless you choose to share it.</p><div className="commerce-form-actions"><Button onClick={async () => { await props.onCapture(); setCaptureNotice(false); }}><Camera size={18} /> Capture still image</Button><Button variant="secondary" onClick={() => setCaptureNotice(false)}>Cancel</Button></div></Card></div> : null}
      {open ? <div className="commerce-modal enquiry-modal" role="dialog" aria-modal="true" aria-labelledby="enquiry-title"><Card><button className="modal-close" type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button><span className="eyebrow">Enquiry initiated—not a sale</span><h2 id="enquiry-title">{actionLabels.find(([value]) => value === type)?.[1]}</h2><div className="form-grid compact-grid">
        <label className="field"><span className="field-label">Your name</span><input className="input" value={form.customerName} onChange={(event) => setForm((value) => ({ ...value, customerName: event.target.value }))} /></label>
        <label className="field"><span className="field-label">Mobile number</span><input className="input" type="tel" value={form.customerMobile} onChange={(event) => setForm((value) => ({ ...value, customerMobile: event.target.value }))} /></label>
        <label className="field"><span className="field-label">Selected hand</span><select className="input" value={form.selectedHand} onChange={(event) => setForm((value) => ({ ...value, selectedHand: event.target.value as typeof form.selectedHand }))}><option value="">Not selected</option><option value="LEFT">Left hand</option><option value="RIGHT">Right hand</option></select></label>
        <label className="field"><span className="field-label">Selected finger</span><input className="input" value={form.selectedFinger} onChange={(event) => setForm((value) => ({ ...value, selectedFinger: event.target.value }))} placeholder="Ring finger" /></label>
        <label className="field"><span className="field-label">Variant or colour</span><input className="input" list="jewellery-variants" value={form.selectedVariant} onChange={(event) => setForm((value) => ({ ...value, selectedVariant: event.target.value }))} /><datalist id="jewellery-variants">{props.variants.map((variant) => <option value={variant} key={variant} />)}</datalist></label>
        {type === "CUSTOM_SIZE_REQUEST" ? <label className="field"><span className="field-label">Required size</span><input className="input" value={form.requestedSize} onChange={(event) => setForm((value) => ({ ...value, requestedSize: event.target.value }))} /></label> : null}
        {type === "STORE_VISIT" || type === "VIDEO_CALL" ? <><label className="field"><span className="field-label">Preferred date</span><input className="input" type="date" value={form.preferredDate} onChange={(event) => setForm((value) => ({ ...value, preferredDate: event.target.value }))} /></label><label className="field"><span className="field-label">Preferred time</span><input className="input" type="time" value={form.preferredTime} onChange={(event) => setForm((value) => ({ ...value, preferredTime: event.target.value }))} /></label></> : null}
        <label className="field form-span"><span className="field-label">Your note</span><textarea className="input" value={form.customerNote} onChange={(event) => setForm((value) => ({ ...value, customerNote: event.target.value }))} /></label>
      </div>{props.screenshotUrl ? <label className="check-row"><input type="checkbox" checked={attachReference} onChange={(event) => setAttachReference(event.target.checked)} /> Add a note that I have a saved try-on image</label> : null}<p className="screenshot-instruction">A standard WhatsApp link cannot attach the image automatically. You may attach your saved try-on image in WhatsApp.</p>{error ? <div className="menu-error" role="alert">{error}</div> : null}{result ? <div className="enquiry-result"><Badge tone="info">{result.statusLabel}</Badge><p>{result.instruction}</p><div className="commerce-form-actions">{result.whatsappUrl ? <a className="button button-primary" href={result.whatsappUrl}><MessageCircle size={18} /> Open WhatsApp</a> : null}<Button variant="secondary" onClick={() => navigator.clipboard.writeText(result.message)}><Copy size={18} /> Copy enquiry</Button>{result.callUrl ? <a className="button button-secondary" href={result.callUrl}><Phone size={18} /> Call store</a> : null}{result.websiteUrl ? <a className="button button-secondary" href={result.websiteUrl}>Website enquiry</a> : null}</div></div> : <div className="commerce-form-actions"><Button onClick={submit} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <MessageCircle size={18} />} Prepare WhatsApp enquiry</Button><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>}</Card></div> : null}
      <nav className="commerce-sticky-bar jewellery-sticky-bar" aria-label="Jewellery enquiry actions"><button className="sticky-cart" type="button" onClick={() => begin("GENERAL_ENQUIRY")}><MessageCircle size={20} /><span><strong>Enquire on WhatsApp</strong><small>{props.productName}</small></span></button><button className="sticky-total" type="button" onClick={() => begin("PRICE_ENQUIRY")}><span>Ask price</span><strong>Direct from store</strong></button></nav>
    </>
  );
}
