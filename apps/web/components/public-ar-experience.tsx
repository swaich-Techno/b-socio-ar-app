"use client";

import { createElement, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Box,
  Contact,
  Instagram,
  LoaderCircle,
  Mail,
  MessageCircle,
  RotateCcw,
  ScanLine,
  Share2,
} from "lucide-react";
import { Button, Card, Progress } from "@bsocio/ui";
import { Brand } from "@/components/brand";

interface ArPayload {
  business: { name: string; slug: string; primaryColour: string };
  product: {
    name: string;
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
}

export function PublicArExperience({
  businessSlug,
  productSlug,
}: {
  businessSlug: string;
  productSlug: string;
}) {
  const [data, setData] = useState<ArPayload | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const viewer = useRef<HTMLElement | null>(null);
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
      loading: "eager",
      scale: `${viewerScale} ${viewerScale} ${viewerScale}`,
      "camera-orbit": data.model.cameraOrbit || undefined,
    },
    createElement(
      "button",
      { slot: "ar-button", className: "button button-primary ar-launch" },
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
      <div className="ar-layout">
        <section className="ar-viewer">
          <div className="ar-stage">{viewerNode}</div>
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
        </section>
        <section className="ar-details">
          <span className="eyebrow">Approved product experience</span>
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
            {data.ar.whatsappUrl ? (
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
        </section>
      </div>
    </main>
  );
}
