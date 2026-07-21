"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileImage,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Rocket,
  Save,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card } from "@bsocio/ui";
import { apiGet, apiPost, useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard-pages";
import { SecureModelViewer } from "@/components/secure-model-viewer";

interface AssetRecord {
  _id: string;
  assetType: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  status: string;
  metadata?: Record<string, unknown>;
}
interface ModelRecord {
  _id: string;
  version: number;
  status: string;
  fileSize?: number;
  polygonCount?: number;
  validationWarnings?: string[];
  technicallyValid?: boolean;
  scale?: number;
  createdAt: string;
}
interface ApprovalRecord {
  _id: string;
  decision: string;
  customerFeedback?: string;
  internalNotes?: string;
  productVersion?: number;
  modelVersion?: number;
  createdAt: string;
}
interface ReviewData {
  product: {
    _id: string;
    name: string;
    category: string;
    description: string;
    material: string;
    colour: string;
    dimensions: { width: number; height: number; depth: number; unit: string };
    price?: number;
    currency?: string;
    customerNotes?: string;
    approvalStatus: string;
    version: number;
    scale?: number;
    cameraOrbit?: string;
  };
  assets: AssetRecord[];
  models: ModelRecord[];
  ar?: { status: string; draftSlug: string; publicSlug?: string };
  qr?: { uniqueCode: string; active: boolean };
  approvals: ApprovalRecord[];
}

const human = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());

function PrivateAsset({ asset }: { asset: AssetRecord }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const result = await apiGet<{ url: string }>(
        `/api/assets/${asset._id}/signed-url`,
      );
      setUrl(result.url);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Preview unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="asset-preview-card">
      <div className="record-title">
        <span>
          <strong>{human(asset.assetType)}</strong>
          <small>
            {String(asset.metadata?.slot ?? asset.originalName)} ·{" "}
            {(asset.size / 1_048_576).toFixed(1)} MB
          </small>
        </span>
        <Badge tone={asset.status === "VALIDATED" ? "success" : "neutral"}>
          {human(asset.status)}
        </Badge>
      </div>
      {url ? (
        <img
          src={url}
          alt={`${human(asset.assetType)} preview`}
          loading="lazy"
        />
      ) : (
        <Button variant="secondary" onClick={load} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Eye size={17} />
          )}{" "}
          Load private preview
        </Button>
      )}
      {error ? <p className="field-error">{error}</p> : null}
    </Card>
  );
}

function ProductEditor({
  product,
  onSaved,
}: {
  product: ReviewData["product"];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: product.name,
    description: product.description,
    category: product.category,
    material: product.material,
    colour: product.colour,
    width: String(product.dimensions.width),
    height: String(product.dimensions.height),
    depth: String(product.dimensions.depth),
    unit: product.dimensions.unit,
    price: product.price === undefined ? "" : String(product.price),
    currency: product.currency ?? "",
    scale: String(product.scale ?? 1),
    cameraOrbit: product.cameraOrbit ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await apiPost("/api/admin/products/update", {
        productId: product._id,
        name: form.name,
        description: form.description,
        category: form.category,
        material: form.material,
        colour: form.colour,
        dimensions: {
          width: Number(form.width),
          height: Number(form.height),
          depth: Number(form.depth),
          unit: form.unit,
        },
        price: form.price ? Number(form.price) : null,
        currency: form.price ? form.currency.toUpperCase() : null,
        scale: Number(form.scale),
        cameraOrbit: form.cameraOrbit || null,
      });
      setMessage("Product details, scale and camera settings saved.");
      await onSaved();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Product update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="content-card">
      <div className="content-card-head">
        <div>
          <h2>Product, scale and camera</h2>
          <p className="muted">
            Administrator edits are validated, versioned and written to the
            audit log.
          </p>
        </div>
        <Save size={22} />
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="input"
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <input
            className="input"
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Material</span>
          <input
            className="input"
            value={form.material}
            onChange={(event) => update("material", event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Colour</span>
          <input
            className="input"
            value={form.colour}
            onChange={(event) => update("colour", event.target.value)}
          />
        </label>
        {(["width", "height", "depth"] as const).map((name) => (
          <label className="field" key={name}>
            <span className="field-label">
              {name[0]?.toUpperCase()}
              {name.slice(1)}
            </span>
            <input
              className="input"
              type="number"
              min="0.001"
              value={form[name]}
              onChange={(event) => update(name, event.target.value)}
            />
          </label>
        ))}
        <label className="field">
          <span className="field-label">Measurement unit</span>
          <select
            className="input"
            value={form.unit}
            onChange={(event) => update("unit", event.target.value)}
          >
            {["mm", "cm", "m", "in", "ft"].map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Price (optional)</span>
          <input
            className="input"
            type="number"
            min="0"
            value={form.price}
            onChange={(event) => update("price", event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Currency</span>
          <input
            className="input"
            maxLength={3}
            value={form.currency}
            onChange={(event) => update("currency", event.target.value)}
            disabled={!form.price}
          />
        </label>
        <label className="field">
          <span className="field-label">Model scale</span>
          <input
            className="input"
            type="number"
            min="0.001"
            step="0.01"
            value={form.scale}
            onChange={(event) => update("scale", event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Camera orbit</span>
          <input
            className="input"
            value={form.cameraOrbit}
            onChange={(event) => update("cameraOrbit", event.target.value)}
            placeholder="45deg 70deg 105%"
          />
        </label>
        <label className="field form-span">
          <span className="field-label">Description</span>
          <textarea
            className="input"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            maxLength={5000}
          />
        </label>
      </div>
      {message ? (
        <div className="form-alert" role="status">
          {message}
        </div>
      ) : null}
      <Button
        onClick={save}
        disabled={
          busy ||
          !form.name ||
          !form.description ||
          (!form.currency && Boolean(form.price))
        }
      >
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Save size={17} />
        )}{" "}
        Save versioned changes
      </Button>
    </Card>
  );
}

function ReplacementUploader({
  productId,
  onComplete,
}: {
  productId: string;
  onComplete: () => Promise<void>;
}) {
  const [assetType, setAssetType] = useState<
    "GLB_MODEL" | "USDZ_MODEL" | "THUMBNAIL"
  >("GLB_MODEL");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  async function checksum(selected: File) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await selected.arrayBuffer(),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  function put(url: string, selected: File, headers: Record<string, string>) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      Object.entries(headers).forEach(([key, value]) =>
        xhr.setRequestHeader(key, value),
      );
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          setProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () =>
        reject(new Error("Replacement upload was interrupted."));
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(
              new Error(`Replacement upload failed with status ${xhr.status}.`),
            );
      xhr.send(selected);
    });
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setProgress(1);
    try {
      const sha = await checksum(file);
      const mimeType =
        assetType === "GLB_MODEL"
          ? "model/gltf-binary"
          : assetType === "USDZ_MODEL"
            ? "model/vnd.usdz+zip"
            : file.type;
      const signed = await apiPost<{
        assetId: string;
        url: string;
        requiredHeaders: Record<string, string>;
      }>("/api/admin/replacements/sign", {
        productId,
        assetType,
        originalName: file.name,
        mimeType,
        size: file.size,
        checksumSha256: sha,
      });
      await put(signed.url, file, signed.requiredHeaders);
      const result = await apiPost<{ version: number }>(
        "/api/admin/replacements/confirm",
        { assetId: signed.assetId, checksumSha256: sha },
      );
      setMessage(
        `Replacement stored privately as model version ${result.version}; manual review is required.`,
      );
      setFile(null);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
      await onComplete();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Replacement upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const accept =
    assetType === "GLB_MODEL"
      ? ".glb,model/gltf-binary"
      : assetType === "USDZ_MODEL"
        ? ".usdz,model/vnd.usdz+zip"
        : "image/jpeg,image/png,image/webp";
  return (
    <Card className="content-card">
      <div className="content-card-head">
        <div>
          <h2>Manual replacement asset</h2>
          <p className="muted">
            GLB, future-compatible USDZ and thumbnail replacements create a new
            private model version and return the product to review.
          </p>
        </div>
        <UploadCloud size={22} />
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Replacement type</span>
          <select
            className="input"
            value={assetType}
            onChange={(event) => {
              setAssetType(event.target.value as typeof assetType);
              setFile(null);
              setProgress(0);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            <option value="GLB_MODEL">GLB model</option>
            <option value="USDZ_MODEL">USDZ model</option>
            <option value="THUMBNAIL">Thumbnail</option>
          </select>
        </label>
        <label className="file-drop">
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <UploadCloud size={22} />
          <span>{file?.name ?? "Choose replacement file"}</span>
          <small>Private R2 upload · SHA-256 checked</small>
        </label>
      </div>
      {busy && progress > 0 ? (
        <div className="progress-wrap">
          <div className="progress-label">
            <span>Uploading replacement</span>
            <span>{progress}%</span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
      {message ? (
        <div className="form-alert" role="status">
          {message}
        </div>
      ) : null}
      <Button onClick={upload} disabled={!file || busy}>
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <UploadCloud size={17} />
        )}{" "}
        Upload replacement privately
      </Button>
    </Card>
  );
}

export function AdminProductReview({ productId }: { productId: string }) {
  const state = useApi<ReviewData>(`/api/products/${productId}`);
  const [feedback, setFeedback] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function decide(decision: string) {
    if (!state.data) return;
    const latestModel = state.data.models[0];
    setBusy(decision);
    setMessage("");
    try {
      await apiPost("/api/admin/review", {
        productId,
        decision,
        customerFeedback: feedback || undefined,
        internalNotes: internalNotes || undefined,
        expectedProductVersion: state.data.product.version,
        expectedModelVersion: latestModel?.version,
      });
      setMessage("Review decision recorded.");
      await state.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Review failed.");
    } finally {
      setBusy("");
    }
  }
  async function publish() {
    setBusy("PUBLISH");
    setMessage("");
    try {
      const result = await apiPost<{ arPath: string }>("/api/admin/publish", {
        productId,
      });
      setMessage(`Live AR published at ${result.arPath}.`);
      await state.reload();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Publishing failed.",
      );
    } finally {
      setBusy("");
    }
  }
  if (state.loading)
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Product review"
          description="Loading private review workspace."
        />
        <Card className="skeleton-card large" />
      </div>
    );
  if (state.error || !state.data)
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Product review"
          description="Private quality workspace."
        />
        <Card className="error-state">
          <AlertTriangle size={24} />
          <strong>{state.error}</strong>
          <Button variant="secondary" onClick={state.reload}>
            <RefreshCw size={17} /> Retry
          </Button>
        </Card>
      </div>
    );
  const { product, assets, models, ar, qr, approvals } = state.data;
  const latest = models[0];
  const imageAssets = assets.filter((asset) =>
    [
      "ORIGINAL_IMAGE",
      "SUPPORTING_IMAGE",
      "PROCESSED_IMAGE",
      "THUMBNAIL",
    ].includes(asset.assetType),
  );
  return (
    <div className="dashboard-page">
      <PageHeader
        title={product.name}
        description={`${product.category} · private administrator quality review`}
        action={
          <Link
            className="button button-secondary"
            href="/admin/approval-queue"
          >
            <ArrowLeft size={17} /> Approval queue
          </Link>
        }
      />
      {message ? (
        <div className="form-alert" role="status">
          {message}
        </div>
      ) : null}
      <div className="product-layout">
        <div className="product-primary">
          <Card className="content-card">
            <div className="content-card-head">
              <div>
                <h2>Product and customer context</h2>
                <p>{product.description}</p>
              </div>
              <Badge tone="warning">{human(product.approvalStatus)}</Badge>
            </div>
            <dl className="detail-grid">
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {product.dimensions.width} × {product.dimensions.height} ×{" "}
                  {product.dimensions.depth} {product.dimensions.unit}
                </dd>
              </div>
              <div>
                <dt>Material / colour</dt>
                <dd>
                  {product.material} / {product.colour}
                </dd>
              </div>
              <div>
                <dt>Customer notes</dt>
                <dd>{product.customerNotes || "None"}</dd>
              </div>
              <div>
                <dt>Scale / camera</dt>
                <dd>
                  {product.scale ?? 1} / {product.cameraOrbit || "Default"}
                </dd>
              </div>
            </dl>
          </Card>
          <ProductEditor product={product} onSaved={state.reload} />
          <ReplacementUploader
            productId={productId}
            onComplete={state.reload}
          />
          <section>
            <div className="content-card-head">
              <div>
                <h2>Private image evidence</h2>
                <p className="muted">
                  Signed previews expire automatically; object keys remain
                  server-side.
                </p>
              </div>
              <FileImage size={23} />
            </div>
            {imageAssets.length ? (
              <div className="asset-preview-grid">
                {imageAssets.map((asset) => (
                  <PrivateAsset key={asset._id} asset={asset} />
                ))}
              </div>
            ) : (
              <Card className="empty-state compact">
                <FileImage size={30} />
                <strong>No validated images</strong>
              </Card>
            )}
          </section>
          {latest ? (
            <Card className="content-card">
              <div className="content-card-head">
                <div>
                  <h2>Generated model · version {latest.version}</h2>
                  <p className="muted">
                    {latest.fileSize
                      ? `${(latest.fileSize / 1_048_576).toFixed(1)} MB`
                      : "Size unavailable"}{" "}
                    · {latest.polygonCount?.toLocaleString() ?? "Unknown"}{" "}
                    polygons
                  </p>
                </div>
                <Badge tone={latest.technicallyValid ? "success" : "warning"}>
                  {human(latest.status)}
                </Badge>
              </div>
              <SecureModelViewer
                modelId={latest._id}
                productName={product.name}
              />
              {latest.validationWarnings?.length ? (
                <ul className="warning-list">
                  {latest.validationWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="form-success">
                  <CheckCircle2 size={16} /> No technical warnings recorded.
                </p>
              )}
            </Card>
          ) : (
            <Card className="empty-state">
              <AlertTriangle size={34} />
              <strong>No generated model is available</strong>
            </Card>
          )}
          <Card className="content-card">
            <div className="content-card-head">
              <div>
                <h2>Review decision</h2>
                <p className="muted">
                  Customer feedback is visible to the customer. Internal notes
                  never are.
                </p>
              </div>
            </div>
            <label className="field">
              <span className="field-label">Customer-visible feedback</span>
              <textarea
                className="input"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                maxLength={3000}
              />
            </label>
            <label className="field">
              <span className="field-label">Internal notes</span>
              <textarea
                className="input"
                value={internalNotes}
                onChange={(event) => setInternalNotes(event.target.value)}
                maxLength={5000}
              />
            </label>
            <div className="review-actions">
              <Button
                onClick={() => decide("APPROVE_PRODUCT")}
                disabled={Boolean(busy) || !latest}
              >
                {busy === "APPROVE_PRODUCT" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <CheckCircle2 size={17} />
                )}{" "}
                Approve product
              </Button>
              <Button
                variant="secondary"
                onClick={() => decide("REQUEST_BETTER_IMAGE")}
                disabled={Boolean(busy)}
              >
                Request better image
              </Button>
              <Button
                variant="secondary"
                onClick={() => decide("REQUEST_MORE_IMAGES")}
                disabled={Boolean(busy)}
              >
                Request more images
              </Button>
              <Button
                variant="secondary"
                onClick={() => decide("REQUEST_REGENERATION")}
                disabled={Boolean(busy) || !latest}
              >
                Request regeneration
              </Button>
              <Button
                variant="danger"
                onClick={() => decide("REJECT_PRODUCT")}
                disabled={Boolean(busy)}
              >
                <XCircle size={17} /> Reject
              </Button>
              {product.approvalStatus === "APPROVED_DEMO" ? (
                <Button onClick={publish} disabled={Boolean(busy)}>
                  {busy === "PUBLISH" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Rocket size={17} />
                  )}{" "}
                  Publish after verified payment
                </Button>
              ) : null}
              {product.approvalStatus === "PUBLISHED" && ar?.publicSlug ? (
                <Link
                  className="button button-primary"
                  href={`/ar/${ar.publicSlug}`}
                >
                  Open live AR
                </Link>
              ) : null}
            </div>
          </Card>
        </div>
        <aside className="product-side">
          <Card className="content-card">
            <h3>Experience review</h3>
            <div className="output-list">
              <div>
                <Eye size={19} />
                <span>
                  <strong>Draft AR</strong>
                  <small>
                    {ar
                      ? `${human(ar.status)} · ${ar.draftSlug}`
                      : "Not created"}
                  </small>
                </span>
              </div>
              <div>
                <QrCode size={19} />
                <span>
                  <strong>Dynamic QR</strong>
                  <small>
                    {qr
                      ? qr.active
                        ? "Published"
                        : "Draft and inactive"
                      : "Not created"}
                  </small>
                </span>
              </div>
            </div>
            {qr ? (
              <img
                className="qr-preview"
                src={`/api/qr/${qr.uniqueCode}/svg`}
                alt={`Private QR preview for ${product.name}`}
              />
            ) : null}
          </Card>
          <Card className="content-card">
            <h3>Versions and decisions</h3>
            <div className="admin-list">
              {models.map((model) => (
                <div key={model._id}>
                  <span>
                    <strong>Model v{model.version}</strong>
                    <small>{new Date(model.createdAt).toLocaleString()}</small>
                  </span>
                  <Badge tone="info">{human(model.status)}</Badge>
                </div>
              ))}
              {approvals.map((approval) => (
                <div key={approval._id}>
                  <span>
                    <strong>{human(approval.decision)}</strong>
                    <small>
                      {new Date(approval.createdAt).toLocaleString()} · product
                      v{approval.productVersion ?? "?"} / model v
                      {approval.modelVersion ?? "?"}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
