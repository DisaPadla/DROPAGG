import { extractMetadata } from "../lib/tier2-extractor";

async function main() {
  const metadata = await extractMetadata("https://www.lidcyberstore.com/product-page/zip-washed-hoodie");
  console.log("Extracted Product Metadata:", metadata);
}

main();
