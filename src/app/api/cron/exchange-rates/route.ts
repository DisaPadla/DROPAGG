import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Use your chosen exchange rate API (e.g., OpenExchangeRates, Fixer.io, or ExchangeRate-API)
const EXCHANGE_RATE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";

export async function GET(request: Request) {
  try {
    // 1. Verify cron secret (if deployed on Vercel or calling from an external scheduler)
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 2. Fetch latest rates from the external API
    const response = await fetch(EXCHANGE_RATE_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch rates: ${response.statusText}`);
    }
    
    const data = await response.json();
    const rates = data.rates; // Assuming JSON structure { rates: { EUR: 0.92, UAH: 38.5, ... } }
    
    // We want to support at least EUR and UAH based on the TDD.
    const targetCurrencies = ["EUR", "UAH", "GBP", "CAD", "JPY"];

    // 3. Upsert rates into our Prisma Database
    const updatePromises = targetCurrencies.map(async (currency) => {
      const rate = rates[currency];
      if (!rate) return null;

      return prisma.exchangeRate.upsert({
        where: { targetCurrency: currency },
        update: {
          rate: rate,
          lastUpdated: new Date()
        },
        create: {
          baseCurrency: "USD",
          targetCurrency: currency,
          rate: rate,
        }
      });
    });

    await Promise.all(updatePromises);

    return NextResponse.json({ 
      success: true, 
      message: "Exchange rates updated successfully." 
    });

  } catch (error: any) {
    console.error("[CRON] Exchange Rate Sync Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
