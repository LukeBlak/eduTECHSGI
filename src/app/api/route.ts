// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}