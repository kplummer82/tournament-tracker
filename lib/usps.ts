// USPS Address Validation API (v3)
// Requires USPS_CLIENT_ID and USPS_CLIENT_SECRET env vars.
// Falls back gracefully if not configured.

const TOKEN_URL = "https://apis.usps.com/oauth2/v3/token";
const ADDRESS_URL = "https://apis.usps.com/addresses/v3/address";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  const clientId = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    console.error("[usps] OAuth token request failed:", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

export interface AddressInput {
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface VerifyResult {
  address: string;
  city: string;
  state: string;
  zip: string;
  verified: boolean;
  error?: string;
}

export async function verifyAddress(input: AddressInput): Promise<VerifyResult> {
  const fallback: VerifyResult = { ...input, verified: false };

  const token = await getToken();
  if (!token) {
    fallback.error = "USPS not configured";
    return fallback;
  }

  try {
    const params = new URLSearchParams({
      streetAddress: input.address,
      city: input.city,
      state: input.state,
      ZIPCode: input.zip,
    });

    const res = await fetch(`${ADDRESS_URL}?${params.toString()}`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[usps] Address validation failed:", res.status, body);
      fallback.error = "USPS validation request failed";
      return fallback;
    }

    const data = await res.json();
    const addr = data.address;
    if (!addr) {
      fallback.error = "No address in USPS response";
      return fallback;
    }

    return {
      address: addr.streetAddress ?? input.address,
      city: addr.city ?? input.city,
      state: addr.state ?? input.state,
      zip: addr.ZIPCode ?? input.zip,
      verified: true,
    };
  } catch (err: any) {
    console.error("[usps] verifyAddress error:", err.message);
    fallback.error = err.message;
    return fallback;
  }
}
