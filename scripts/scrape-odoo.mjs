import * as cheerio from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";

const BASE_URL = "https://discusgiants.odoo.com";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const OUT_JS = "src/data/catalogData.js";
const OUT_JSON = "data/catalog-snapshot.json";

const headers = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DiscusGiantsERP/1.0",
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al leer ${url}`);
  }
  return response.text();
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error: error.message, input: items[index] };
      }
      await delay(50);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

function absoluteUrl(value) {
  if (!value) return "";
  return new URL(value, BASE_URL).toString();
}

function cleanText(value = "") {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readMeta($, name) {
  return cleanText(
    $(`meta[property="${name}"]`).attr("content") ||
      $(`meta[name="${name}"]`).attr("content") ||
      ""
  );
}

function cleanPageTitle(value = "") {
  return cleanText(value.replace(/\s*\|\s*DISCUS GIANTS\s*$/i, ""));
}

function productSlugFromUrl(url) {
  const parsed = new URL(url, BASE_URL);
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts[0] !== "shop") return "";
  if (parts.includes("category")) return "";
  const last = parts.at(-1) || "";
  if (!last || ["cart", "wishlist", "checkout"].includes(last)) return "";
  if (last === "shop" || last === "page") return "";
  return last;
}

function normalizeProductUrl(url) {
  const slug = productSlugFromUrl(url);
  return slug ? `${BASE_URL}/shop/${slug}` : "";
}

function parseJsonLdProduct($) {
  const found = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.["@type"] === "Product") found.push(item);
      }
    } catch {
      // Odoo can inject unrelated JSON-LD blocks; ignore those.
    }
  });
  return found[0] || {};
}

function parseSitemap(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
}

function categoryPathFromPage($, fallbackTitle) {
  const crumbs = $("ol.breadcrumb .breadcrumb-item")
    .map((_, item) => cleanPageTitle($(item).text()))
    .get()
    .filter(Boolean)
    .filter((item) => !/^(inicio|tienda|todos los productos)$/i.test(item));
  const filteredCrumbs = crumbs.filter((item) => !/^productos\.{0,3}$/i.test(item));
  const title = cleanPageTitle(fallbackTitle);
  if (
    title &&
    !/^productos\.{0,3}$/i.test(title) &&
    !filteredCrumbs.some((crumb) => crumb.toLowerCase() === title.toLowerCase())
  ) {
    filteredCrumbs.push(title);
  }
  return unique(filteredCrumbs);
}

function inferKind(path, title) {
  const value = `${path.join(" ")} ${title}`.toLowerCase();
  if (value.includes("alimento") || value.includes("papilla") || value.includes("food")) {
    return "Alimento";
  }
  if (value.includes("cuidado") || value.includes("medicamento") || value.includes("acondicionador")) {
    return "Cuidado";
  }
  if (value.includes("material filtrante") || value.includes("filtracion") || value.includes("filtración")) {
    return "Material filtrante";
  }
  if (
    value.includes("equipo") ||
    value.includes("lampara") ||
    value.includes("lámpara") ||
    value.includes("bomba") ||
    value.includes("calentador") ||
    value.includes("termometro") ||
    value.includes("termómetro")
  ) {
    return "Equipo";
  }
  if (
    value.includes("peces") ||
    value.includes("disco") ||
    value.includes("loricariidae") ||
    value.includes("ancistr") ||
    value.includes("altum") ||
    value.includes("dantum") ||
    value.includes("angel") ||
    /^l\d{3}/i.test(title)
  ) {
    return "Pez";
  }
  return "Producto";
}

function inferFallbackPath(title, slug) {
  const value = `${title} ${slug}`.toLowerCase();
  if (value.includes("papilla") || value.includes("food")) return ["Alimentos"];
  if (value.includes("l046") || value.includes("l183") || value.includes("l333")) {
    return ["Peces", "Loricariidae", "Ancistrinae"];
  }
  if (/^l\d{3}/i.test(title)) return ["Peces", "Loricariidae"];
  if (value.includes("altum") || value.includes("dantum") || value.includes("angel")) {
    return ["Peces", "Escalares"];
  }
  if (
    value.includes("heckel") ||
    value.includes("red") ||
    value.includes("leopard") ||
    value.includes("panda") ||
    value.includes("checkerboard") ||
    value.includes("snow") ||
    value.includes("pigeon") ||
    value.includes("alenquer") ||
    value.includes("disco")
  ) {
    return ["Peces", "Disco"];
  }
  if (value.includes("lampara") || value.includes("lámpara")) return ["Equipos y Accesorios", "Lámparas"];
  if (value.includes("calentador")) return ["Equipos y Accesorios", "Calentadores"];
  if (value.includes("bomba") || value.includes("aireador")) return ["Equipos y Accesorios", "Bomba de Aire"];
  if (value.includes("cepillo") || value.includes("termometro") || value.includes("termómetro")) {
    return ["Equipos y Accesorios"];
  }
  if (
    value.includes("canutillo") ||
    value.includes("biobola") ||
    value.includes("esponja") ||
    value.includes("carbon") ||
    value.includes("carbón") ||
    value.includes("k1") ||
    value.includes("bloque") ||
    value.includes("cubo")
  ) {
    return ["Material Filtrante"];
  }
  if (value.includes("bacteria") || value.includes("sal ") || value.includes("probiotico")) {
    return ["Cuidado"];
  }
  return ["Productos"];
}

function sizeFromTitle(title) {
  const match = title.match(/(\d+(?:[.,]\d+)?)\s*(?:["”]|pulg|in\b)/i);
  if (!match) return "";
  return `${match[1].replace(",", ".")}"`;
}

function varietyFromTitle(title) {
  return cleanText(
    title
      .replace(/\bpareja reproductora\b/gi, "")
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:["”]|pulg|in\b)?/gi, "")
      .replace(/\s{2,}/g, " ")
  );
}

function completeRelationPath(basePath, title, slug, kind) {
  const path = basePath.length ? [...basePath] : inferFallbackPath(title, slug);
  const lowered = path.map((item) => item.toLowerCase());
  const isDisco = lowered.includes("disco") || lowered.includes("discos");
  const isFish = kind === "Pez" || lowered.includes("peces");
  if (kind === "Alimento") {
    if (/discos?/i.test(title) && !lowered.includes("discos")) path.push("Discos");
    if (/goldfish/i.test(title) && !lowered.includes("goldfish")) path.push("Goldfish");
  }
  if (isDisco) {
    const size = sizeFromTitle(title);
    if (size && !path.includes(size)) path.push(size);
    const variety = varietyFromTitle(title);
    if (variety && !path.some((item) => item.toLowerCase() === variety.toLowerCase())) {
      path.push(variety);
    }
  } else if (isFish) {
    const variety = varietyFromTitle(title);
    if (variety && !path.some((item) => item.toLowerCase() === variety.toLowerCase())) {
      path.push(variety);
    }
  }
  return unique(path);
}

function textFromBlock($, node) {
  const segments = node
    .find("p, li, div")
    .map((_, item) => cleanText($(item).text()))
    .get()
    .filter(Boolean);
  return cleanText(segments.length ? segments.join(" ") : node.text());
}

function unitFor(kind, title) {
  if (kind === "Pez") return /pareja/i.test(title) ? "pareja" : "ejemplar";
  if (kind === "Alimento") return "paquete";
  if (kind === "Material filtrante") return "pieza";
  return "pieza";
}

function inventoryStatus(description) {
  const value = description.toLowerCase();
  if (value.includes("preventa") || value.includes("llegada") || value.includes("apartado")) {
    return "Preventa";
  }
  return "Por confirmar";
}

async function crawlCategories(categoryUrls) {
  const pages = [];
  const seen = new Set();

  async function readCategoryPage(url) {
    if (seen.has(url)) return;
    seen.add(url);
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const title = cleanPageTitle(readMeta($, "og:title") || $("h1").first().text());
    const path = categoryPathFromPage($, title);
    const productSlugs = unique(
      $('a[href*="/shop/"]')
        .map((_, link) => productSlugFromUrl($(link).attr("href") || ""))
        .get()
    );
    pages.push({ url, title, path, productSlugs });

    const pagerUrls = unique(
      $("#o_wsale_pager a[href]")
        .map((_, link) => absoluteUrl($(link).attr("href")))
        .get()
        .filter((href) => href.startsWith(url.replace(/\/page\/\d+$/, "")))
    );
    for (const pagerUrl of pagerUrls) {
      if (!seen.has(pagerUrl)) await readCategoryPage(pagerUrl);
    }
  }

  await mapLimit(categoryUrls, 3, readCategoryPage);
  return pages;
}

function bestCategoryPath(slug, categoryPages) {
  const paths = categoryPages
    .filter((category) => category.productSlugs.includes(slug))
    .map((category) => category.path)
    .filter((path) => path.length);
  if (!paths.length) return [];
  return paths.sort((a, b) => b.length - a.length)[0];
}

async function readProduct(url, categoryPages) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const slug = productSlugFromUrl(url);
  const product = parseJsonLdProduct($);
  const metaTitle = readMeta($, "og:title");
  const name = cleanText(product.name || metaTitle || $("#product_detail_main h1").first().text());
  const productId = $('input[name="product_id"]').first().attr("value") || slug.match(/-(\d+)$/)?.[1] || slug;
  const templateId =
    $('input[name="product_template_id"]').first().attr("value") || productId;
  const categoryId = $('input[name="product_category_id"]').first().attr("value") || "";

  const descriptionNode = $("#product_detail_main h1").nextAll(".oe_structure").first();
  const descriptionText = textFromBlock($, descriptionNode);
  const descriptionHtml = descriptionText ? cleanText(descriptionNode.html() || "") : "";

  const imageCandidates = [
    product.image,
    readMeta($, "og:image"),
    ...$("#product_detail_main img")
      .map((_, img) => $(img).attr("data-zoom-image") || $(img).attr("src"))
      .get(),
  ];
  const images = unique(imageCandidates.map(absoluteUrl));

  const tagNames = unique(
    $("img.o_product_tag_img")
      .map((_, img) => cleanText($(img).attr("alt") || ""))
      .get()
  );

  const categoryPath = bestCategoryPath(slug, categoryPages);
  const kind = inferKind(categoryPath, name);
  const relationPath = completeRelationPath(categoryPath, name, slug, kind);
  const price = Number(product.offers?.price ?? product.offers?.[0]?.price ?? 0);
  const currency = product.offers?.priceCurrency || product.offers?.[0]?.priceCurrency || "MXN";

  return {
    id: `odoo-${productId}`,
    odooId: String(productId),
    templateId: String(templateId),
    categoryId: String(categoryId),
    source: "odoo",
    sourceUrl: normalizeProductUrl(url),
    slug,
    name,
    kind,
    unit: unitFor(kind, name),
    price,
    currency,
    cost: 0,
    stock: 0,
    reserved: 0,
    incoming: 0,
    minStock: kind === "Alimento" ? 5 : 0,
    status: inventoryStatus(descriptionText),
    relationPath,
    tags: tagNames,
    imageUrl: images[0] || "",
    images,
    description: descriptionText,
    descriptionHtml,
    notes: "Importado del sitio Odoo. Existencias pendientes de captura manual.",
    featured:
      ["L046", "L183", "Papilla Nutricional Avanzada para Discos"].includes(name) ||
      /heckel|papilla/i.test(name),
  };
}

function manualGiantsFood(products) {
  const foodImage =
    products.find((item) => /papilla nutricional avanzada para discos/i.test(item.name))?.imageUrl ||
    products.find((item) => item.kind === "Alimento")?.imageUrl ||
    "";
  const suggestedPrice =
    products.find((item) => /papilla nutricional avanzada para discos/i.test(item.name))?.price || 0;
  return {
    id: "manual-giants-food",
    source: "manual",
    sourceUrl: "",
    slug: "giants-food",
    name: "Giants Food",
    kind: "Alimento",
    unit: "paquete",
    price: suggestedPrice,
    currency: "MXN",
    cost: 0,
    stock: 0,
    reserved: 0,
    incoming: 0,
    minStock: 10,
    status: "Clave",
    relationPath: ["Alimentos", "Giants Food"],
    tags: ["Top seller", "Manual"],
    imageUrl: foodImage,
    images: foodImage ? [foodImage] : [],
    description:
      "Producto clave agregado manualmente por instruccion del negocio. Ajusta presentacion, precio y foto final cuando tengas la ficha definitiva.",
    descriptionHtml: "",
    notes:
      "No aparecio en el sitemap de Odoo; se agrego como producto prioritario editable.",
    featured: true,
    priority: "top-seller",
  };
}

async function buildSnapshot() {
  const sitemap = await fetchText(SITEMAP_URL);
  const locs = parseSitemap(sitemap);
  const productUrls = unique(
    locs
      .filter((url) => /\/shop\/(?!category|cart|wishlist|$)/.test(url))
      .map(normalizeProductUrl)
  );
  const categoryUrls = unique(locs.filter((url) => /\/shop\/category\//.test(url)));

  console.log(`Leyendo ${categoryUrls.length} categorias...`);
  const categoryPages = await crawlCategories(categoryUrls);

  console.log(`Leyendo ${productUrls.length} productos...`);
  const productResults = await mapLimit(productUrls, 6, (url) => readProduct(url, categoryPages));
  const products = productResults
    .filter((item) => item && !item.error)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const missing = productResults.filter((item) => item?.error);
  if (missing.length) {
    console.warn(`No se pudieron leer ${missing.length} productos.`);
  }

  const giantsFood = manualGiantsFood(products);
  const allProducts = products.some((item) => item.slug === "giants-food")
    ? products
    : [giantsFood, ...products].sort((a, b) => a.name.localeCompare(b.name, "es"));

  const categories = unique(
    categoryPages
      .map((category) => category.path.join(" > "))
      .filter(Boolean)
  ).map((path, index) => ({
    id: `cat-${index + 1}`,
    path: path.split(" > "),
    label: path,
  }));

  return {
    scrapedAt: new Date().toISOString(),
    source: BASE_URL,
    productCount: allProducts.length,
    importedProductCount: products.length,
    manualProductCount: allProducts.length - products.length,
    categoryCount: categories.length,
    business: {
      name: "DISCUS GIANTS",
      legalName: "DISCUSGIANTS",
      siteUrl: BASE_URL,
      currency: "MXN",
      phone: "+52 55 5412 2523",
      email: "discusgiants@outlook.com",
      address:
        "Calle Francisco Javier Mina 27, San Antonio los Pocitos, 52920 Cdad. Lopez Mateos, Mex.",
      whatsappGroup: "https://chat.whatsapp.com/EJn1g4yXWmwFEYtXa0u002",
      description:
        "Marca mexicana especializada en cuidado, seleccion y difusion de peces de agua dulce.",
    },
    categories,
    products: allProducts,
  };
}

const snapshot = await buildSnapshot();
await mkdir("src/data", { recursive: true });
await mkdir("data", { recursive: true });
await writeFile(OUT_JSON, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
await writeFile(
  OUT_JS,
  `// Generado por npm run scrape:catalog desde ${BASE_URL}\nexport const catalogSnapshot = ${JSON.stringify(
    snapshot,
    null,
    2
  )};\n`,
  "utf8"
);

console.log(
  `Catalogo generado: ${snapshot.importedProductCount} de Odoo + ${snapshot.manualProductCount} manual (${OUT_JS}).`
);
