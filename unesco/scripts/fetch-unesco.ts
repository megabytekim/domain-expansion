import { writeFileSync } from "fs";
import { resolve } from "path";

async function fetchUnesco() {
  console.log("Fetching UNESCO World Heritage List XML...");
  const res = await fetch("https://whc.unesco.org/en/list/xml/");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  console.log(`Received ${xml.length} bytes`);

  const rows = xml.match(/<row>[\s\S]*?<\/row>/g) || [];
  console.log(`Found ${rows.length} sites`);

  const features = [];

  for (const row of rows) {
    const get = (tag: string): string => {
      const m = row.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
      if (m) return m[1].trim();
      const m2 = row.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`));
      return m2 ? m2[1].trim() : "";
    };

    const lat = parseFloat(get("latitude"));
    const lng = parseFloat(get("longitude"));
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;

    const category = get("category");
    const mappedCategory =
      category === "Cultural" ? "Cultural" :
      category === "Natural" ? "Natural" : "Mixed";

    const description = get("short_description")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    features.push({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [lng, lat] as [number, number],
      },
      properties: {
        id: parseInt(get("id_number"), 10),
        name: get("site"),
        country: get("states"),
        isoCode: get("iso_code"),
        region: get("region"),
        category: mappedCategory,
        year: parseInt(get("date_inscribed"), 10) || 0,
        endangered: get("danger") === "1",
        description,
        imageUrl: get("image_url"),
        url: get("http_url"),
        criteria: get("criteria_txt"),
        hasHyecho: false,
        hyechoPackages: [],
      },
    });
  }

  const geojson = { type: "FeatureCollection", features };
  const outPath = resolve(__dirname, "../data/unesco-sites.json");
  writeFileSync(outPath, JSON.stringify(geojson, null, 2));
  console.log(`Wrote ${features.length} sites to ${outPath}`);
}

fetchUnesco().catch(console.error);
