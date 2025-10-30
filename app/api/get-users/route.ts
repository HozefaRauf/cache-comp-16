import { NextResponse } from "next/server";
import { sleep } from "@/lib/sleep";

// GET /api/get-users?limit=100&delay=2000
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const limit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
	const delay = Number.parseInt(searchParams.get("delay") ?? "2000", 10);

	// Clamp to sane bounds
	const safeDelay = Number.isFinite(delay) ? Math.max(0, Math.min(delay, 30000)) : 0;
	const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 1000)) : 100;

	// Simulate slow network before fetching upstream
	if (safeDelay > 0) await sleep(safeDelay);

	try {
		const upstream = await fetch(`https://dummyjson.com/users?limit=${safeLimit}`, {
			cache: "no-store",
		});

		if (!upstream.ok) {
			return NextResponse.json(
				{ error: "Upstream fetch failed" },
				{ status: upstream.status, headers: { "x-delay-applied": String(safeDelay) } }
			);
		}

		const data = await upstream.json();
		return NextResponse.json(data, { headers: { "x-delay-applied": String(safeDelay) } });
	} catch (err: any) {
		return NextResponse.json(
			{ error: err?.message ?? "Unknown error" },
			{ status: 500, headers: { "x-delay-applied": String(safeDelay) } }
		);
	}
}

