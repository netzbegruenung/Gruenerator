import { NextResponse } from 'next/server';

export async function GET() {
  const isDisabled = process.env.DISABLE_ANONYMOUS_TELEMETRY === 'true' || process.env.DISABLE_ANONYMOUS_TELEMETRY === 'True';
  const telemetryEnabled = !isDisabled;
  return NextResponse.json({ telemetryEnabled });
}


