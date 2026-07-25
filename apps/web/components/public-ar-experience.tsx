"use client";

import { createElement, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Box,
  Camera,
  Contact,
  Instagram,
  LoaderCircle,
  Mail,
  MessageCircle,
  RotateCcw,
  ScanLine,
  Share2,
  SwitchCamera,
} from "lucide-react";
import { Button, Card, Progress } from "@bsocio/ui";
import { Brand } from "@/components/brand";
import { FoodCommerceActions, JewelleryCommerceActions } from "@/components/commerce-public-actions";

interface ArPayload {
  business: { name: string; slug: string; category: string; primaryColour: string; website?: string };
  product: {
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string;
    material: string;
    colour: string;
    dimensions: { width: number; height: number; depth: number; unit: string };
    price?: number;
    currency?: string;
  };
  ar: {
    whatsappUrl?: string;
    websiteUrl?: string;
    instagramUrl?: string;
    contactUrl?: string;
  };
  model: {
    id: string;
    url: string;
    usdzUrl?: string;
    fileSize?: number;
    hasUsdz: boolean;
    scale?: number;
    cameraOrbit?: string;
  };
  commerce: {
    kind: "RESTAURANT" | "JEWELLERY";
    menuCategory?: string;
    servingInformation?: string;
    approximateServingSize?: string;
    sku?: string;
    jewelleryCategory?: string;
    metalType?: string;
    stoneType?: string;
    productSize?: string;
    variants: string[];
    branches: Array<{ branchId: string; branchName: string }>;
    tryOnEnabled: boolean;
  } | null;
  diningSession: {
    active: boolean;
    table: { id: string; number: string; name: string } | null;
  };
}

export function PublicArExperience({
  businessSlug,
  productSlug,
  experienceKind = "default",
  sessionToken = "",
  launchAr = false,
}: {
  businessSlug: string;
  productSlug: string;
  experienceKind?: "default" | "restaurant" | "jewellery";
  sessionToken?: string;
  launchAr?: boolean;
}) {
  const [data, setData] = useState<ArPayload | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [cameraError, setCameraError] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const viewer = useRef<HTMLElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const screenshot = useRef("");
  const tryOnStartedAt = useRef<number | null>(null);
  const durationReported = useRef(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("@google/model-viewer"),
      fetch(`/api/public/ar/${businessSlug}/${productSlug}`, {
        cache: "no-store",
      }),
    ])
      .then(async ([, response]) => {
        const payload = (await response.json()) as {
          data?: ArPayload;
          error?: { message?: string };
        };
        if (!cancelled) {
          if (!response.ok || !payload.data)
            setError(
              payload.error?.message ?? "This AR experience is not available.",
            );
          else setData(payload.data);
        }
      })
      .catch(() => {
        if (!cancelled) setError("This AR experience could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [businessSlug, productSlug]);
  useEffect(() => {
    const element = viewer.current;
    if (!element) return;
    const update = (event: Event) =>
      setProgress(
        Math.round(
          ((event as CustomEvent<{ totalProgress?: number }>).detail
            .totalProgress ?? 0) * 100,
        ),
      );
    element.addEventListener("progress", update);
    return () => element.removeEventListener("progress", update);
  }, [data]);
  useEffect(() => () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    if (screenshot.current) URL.revokeObjectURL(screenshot.current);
  }, []);
  const effectiveKind = experienceKind === "default"
    ? data?.commerce?.kind === "RESTAURANT"
      ? "restaurant"
      : data?.commerce?.kind === "JEWELLERY"
        ? "jewellery"
        : "default"
    : experienceKind;
  async function track(eventType: string, durationSeconds?: number) {
    if (!data || effectiveKind === "default") return;
    const endpoint = effectiveKind === "restaurant"
      ? "/api/restaurant/analytics"
      : `/api/jewellery/analytics?businessSlug=${encodeURIComponent(data.business.slug)}`;
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { "x-dining-session": sessionToken } : {}),
      },
      body: JSON.stringify({ eventType, productId: data.product.id, durationSeconds }),
    }).catch(() => undefined);
  }
  useEffect(() => {
    if (!data || effectiveKind !== "jewellery") return;
    const recordDuration = () => {
      if (!tryOnStartedAt.current || durationReported.current) return;
      durationReported.current = true;
      const durationSeconds = Math.max(1, Math.round((Date.now() - tryOnStartedAt.current) / 1000));
      const endpoint = `/api/jewellery/analytics?businessSlug=${encodeURIComponent(data.business.slug)}`;
      const body = JSON.stringify({ eventType: "TRY_ON_DURATION", productId: data.product.id, durationSeconds });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      } else {
        void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
      }
    };
    window.addEventListener("pagehide", recordDuration);
    return () => {
      window.removeEventListener("pagehide", recordDuration);
      recordDuration();
    };
  }, [data, effectiveKind]);
  async function startCamera(nextFacing = cameraFacing) {
    setCameraError("");
    try {
      const startingTryOn = !cameraActive;
      stream.current?.getTracks().forEach((track) => track.stop());
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      stream.current = nextStream;
      if (video.current) {
        video.current.srcObject = nextStream;
        await video.current.play();
      }
      setCameraFacing(nextFacing);
      setCameraActive(true);
      if (startingTryOn) {
        tryOnStartedAt.current = Date.now();
        durationReported.current = false;
      }
      await Promise.all([
        track(nextFacing === "user" ? "FRONT_CAMERA_TRY_ON" : "REAR_CAMERA_TRY_ON"),
        ...(startingTryOn ? [track("TRY_ON_START")] : []),
      ]);
    } catch {
      setCameraError("Camera permission is required for the live try-on preview. You can still view the 3D model.");
    }
  }
  async function switchCamera() {
    await startCamera(cameraFacing === "user" ? "environment" : "user");
  }
  async function capturePreview() {
    if (!video.current || !cameraActive) throw new Error("Start the camera preview before taking a screenshot.");
    const source = video.current;
    const width = source.videoWidth || 720;
    const height = source.videoHeight || 960;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Screenshot capture is not available on this device.");
    if (cameraFacing === "user") {
      context.save();
      context.translate(width, 0);
      context.scale(-1, 1);
      context.drawImage(source, 0, 0, width, height);
      context.restore();
    } else {
      context.drawImage(source, 0, 0, width, height);
    }
    const modelViewer = viewer.current as (HTMLElement & { toDataURL?: (type?: string) => string }) | null;
    let modelData = "";
    try { modelData = modelViewer?.toDataURL?.("image/png") ?? ""; } catch { modelData = ""; }
    if (modelData) {
      const overlay = new Image();
      overlay.src = modelData;
      await new Promise<void>((resolve) => { overlay.onload = () => resolve(); overlay.onerror = () => resolve(); });
      context.drawImage(overlay, 0, 0, width, height);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.94));
    if (!blob) throw new Error("Screenshot capture is not available on this device.");
    if (screenshot.current) URL.revokeObjectURL(screenshot.current);
    screenshot.current = URL.createObjectURL(blob);
    setScreenshotUrl(screenshot.current);
    await track("SCREENSHOT_CAPTURE");
  }
  function deleteCapture() {
    if (screenshot.current) URL.revokeObjectURL(screenshot.current);
    screenshot.current = "";
    setScreenshotUrl("");
  }
  async function share() {
    if (navigator.share)
      await navigator.share({
        title: data?.product.name,
        text: data?.product.description,
        url: location.href,
      });
    else await navigator.clipboard.writeText(location.href);
  }
  if (error)
    return (
      <main id="main-content" className="ar-error">
        <Card>
          <Box size={38} />
          <h1>Experience unavailable</h1>
          <p>{error}</p>
          <Link className="button button-primary" href="/">
            Visit B Socio AR
          </Link>
        </Card>
      </main>
    );
  if (!data)
    return (
      <main id="main-content" className="ar-loading">
        <LoaderCircle className="spin" size={36} />
        <strong>Preparing product AR…</strong>
        <span>Loading the approved mobile experience.</span>
      </main>
    );
  const viewerScale = data.model.scale ?? 1;
  const viewerNode = createElement(
    "model-viewer",
    {
      ref: (node: HTMLElement | null) => {
        viewer.current = node;
      },
      src: data.model.url,
      "ios-src": data.model.usdzUrl,
      alt: `Interactive 3D model of ${data.product.name}`,
      ar: true,
      "ar-modes": "webxr scene-viewer quick-look",
      "camera-controls": true,
      "touch-action": "pan-y",
      "auto-rotate": true,
      "shadow-intensity": "1",
      "environment-image": "neutral",
      style: effectiveKind === "jewellery" && cameraActive ? { background: "transparent" } : undefined,
      loading: "eager",
      scale: `${viewerScale} ${viewerScale} ${viewerScale}`,
      "camera-orbit": data.model.cameraOrbit || undefined,
    },
    createElement(
      "button",
      { slot: "ar-button", className: "button button-primary ar-launch", onClick: () => void track(effectiveKind === "restaurant" ? "AR_LAUNCH" : "REAR_CAMERA_TRY_ON") },
      createElement(ScanLine, { size: 19 }),
      "View in your space",
    ),
  );
  return (
    <main
      id="main-content"
      className="public-ar"
      style={
        {
          "--business-colour": data.business.primaryColour,
        } as React.CSSProperties
      }
    >
      <header className="ar-header">
        <Brand />
        <span>
          Experience by <strong>{data.business.name}</strong>
        </span>
      </header>
      <div className={`ar-layout ${effectiveKind !== "default" ? "has-commerce-actions" : ""}`}>
        <section className="ar-viewer">
          <div className={`ar-stage ${effectiveKind === "jewellery" && cameraActive ? "tryon-camera-stage" : ""}`}>
            {effectiveKind === "jewellery" ? <video ref={video} className="tryon-camera-video" style={{ transform: cameraFacing === "user" ? "scaleX(-1)" : "none" }} autoPlay muted playsInline aria-label="Live virtual try-on camera preview" /> : null}
            {viewerNode}
          </div>
          {progress < 100 ? (
            <div className="ar-progress">
              <Progress value={progress} label="Loading 3D model" />
            </div>
          ) : null}
          <Button
            className="ar-reset"
            variant="secondary"
            onClick={() =>
              viewer.current?.setAttribute(
                "camera-orbit",
                data.model.cameraOrbit || "auto auto auto",
              )
            }
          >
            <RotateCcw size={17} /> Reset view
          </Button>
          {effectiveKind === "jewellery" ? <div className="tryon-camera-controls">
            {!cameraActive ? <Button variant="secondary" onClick={() => startCamera()}><Camera size={17} /> Start try-on camera</Button> : <Button variant="secondary" onClick={switchCamera}><SwitchCamera size={17} /> Switch camera</Button>}
          </div> : null}
          {cameraError ? <div className="tryon-camera-error" role="alert">{cameraError}</div> : null}
        </section>
        <section className="ar-details">
          <span className="eyebrow">{effectiveKind === "restaurant" ? "Table-ready food experience" : effectiveKind === "jewellery" ? "Private virtual try-on" : "Approved product experience"}</span>
          <h1>{data.product.name}</h1>
          <p>{data.product.description}</p>
          {data.product.price !== undefined ? (
            <div className="ar-price">
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: data.product.currency ?? "USD",
              }).format(data.product.price)}
            </div>
          ) : null}
          <dl className="detail-grid">
            <div>
              <dt>Dimensions</dt>
              <dd>
                {data.product.dimensions.width} ×{" "}
                {data.product.dimensions.height} ×{" "}
                {data.product.dimensions.depth} {data.product.dimensions.unit}
              </dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{data.product.material}</dd>
            </div>
            <div>
              <dt>Colour</dt>
              <dd>{data.product.colour}</dd>
            </div>
            <div>
              <dt>Model size</dt>
              <dd>
                {data.model.fileSize
                  ? `${(data.model.fileSize / 1_048_576).toFixed(1)} MB`
                  : "Optimised GLB"}
              </dd>
            </div>
          </dl>
          <div className="ar-actions">
            {effectiveKind === "default" && data.ar.whatsappUrl ? (
              <a
                className="button button-primary"
                href={data.ar.whatsappUrl}
                rel="noopener noreferrer"
              >
                <MessageCircle size={18} /> WhatsApp
              </a>
            ) : null}
            {data.ar.websiteUrl ? (
              <a
                className="button button-secondary"
                href={data.ar.websiteUrl}
                rel="noopener noreferrer"
              >
                <Contact size={18} /> Website
              </a>
            ) : null}
            {data.ar.instagramUrl ? (
              <a
                className="button button-secondary"
                href={data.ar.instagramUrl}
                rel="noopener noreferrer"
              >
                <Instagram size={18} /> Instagram
              </a>
            ) : null}
            {data.ar.contactUrl ? (
              <a
                className="button button-secondary"
                href={data.ar.contactUrl}
                rel="noopener noreferrer"
              >
                <Mail size={18} /> Contact
              </a>
            ) : null}
            <Button variant="secondary" onClick={share}>
              <Share2 size={18} /> Share
            </Button>
          </div>
          <p className="ar-compatibility">
            <ScanLine size={17} /> Android Scene Viewer and WebXR are used when
            available. Apple Quick Look appears when a USDZ version exists.
          </p>
          {launchAr && effectiveKind === "restaurant" ? <p className="ar-launch-hint"><ScanLine size={17} /> Tap “View in your space” on the model to place this dish on your table.</p> : null}
          {effectiveKind === "restaurant" ? <FoodCommerceActions businessSlug={data.business.slug} productId={data.product.id} productName={data.product.name} price={data.product.price} currency={data.product.currency} sessionToken={sessionToken} sessionActive={data.diningSession.active} tableName={data.diningSession.table?.name} /> : null}
          {effectiveKind === "jewellery" ? <JewelleryCommerceActions businessSlug={data.business.slug} businessName={data.business.name} productId={data.product.id} productSlug={data.product.slug} productName={data.product.name} variants={data.commerce?.variants ?? []} branches={data.commerce?.branches ?? []} screenshotUrl={screenshotUrl} onCapture={capturePreview} onRetake={capturePreview} onDeleteCapture={deleteCapture} onStartCamera={() => startCamera()} cameraActive={cameraActive} /> : null}
        </section>
      </div>
    </main>
  );
}
