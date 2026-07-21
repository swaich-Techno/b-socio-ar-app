/// <reference path="./qrcode-svg.d.ts" />
import QRCode from "qrcode";
import QRCodeSvg from "qrcode-svg";

export interface QrStyle {
  foreground?: string;
  background?: string;
  size?: number;
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  transparent?: boolean;
}

function validateColour(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error("QR colours must use six-digit hex notation");
  return value;
}

export async function createQrPng(content: string, style: QrStyle = {}): Promise<Buffer> {
  if (!content || content.length > 2_000) throw new Error("QR destination is invalid");
  const foreground = validateColour(style.foreground, "#0F172A");
  const background = style.transparent ? "#00000000" : validateColour(style.background, "#FFFFFF");
  return QRCode.toBuffer(content, {
    type: "png",
    width: Math.min(Math.max(style.size ?? 1024, 256), 4096),
    margin: 4,
    errorCorrectionLevel: style.errorCorrectionLevel ?? "H",
    color: { dark: foreground, light: background },
  });
}

export function createQrSvg(content: string, style: QrStyle = {}): string {
  if (!content || content.length > 2_000) throw new Error("QR destination is invalid");
  const size = Math.min(Math.max(style.size ?? 1024, 256), 4096);
  return new QRCodeSvg({
    content,
    width: size,
    height: size,
    padding: 4,
    color: validateColour(style.foreground, "#0F172A"),
    background: style.transparent ? "transparent" : validateColour(style.background, "#FFFFFF"),
    ecl: style.errorCorrectionLevel ?? "H",
    join: true,
    container: "svg",
  }).svg();
}
