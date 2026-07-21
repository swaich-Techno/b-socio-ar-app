declare module "qrcode-svg" {
  interface Options {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    ecl?: "L" | "M" | "Q" | "H";
    join?: boolean;
    container?: "svg";
  }
  export default class QRCodeSvg {
    constructor(options: Options);
    svg(): string;
  }
}
