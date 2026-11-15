/** The public address used in links inside emails. APP_URL wins; otherwise the address of this request. */
export function appOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}
