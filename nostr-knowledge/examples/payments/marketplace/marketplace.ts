/**
 * Nostr Marketplace (NIP-15) — TypeScript
 *
 * Demonstrates the decentralized marketplace protocol:
 *   1. Create a stall (kind 30017) — merchant's shop
 *   2. List products (kind 30018) — items for sale
 *   3. Place an order (kind 30019 DM) — buyer sends encrypted order
 *   4. Fetch stalls and products from relays
 *
 * NIP-15 defines a decentralized marketplace where merchants list products
 * on Nostr relays and buyers place orders via encrypted direct messages.
 * Payments are handled over Lightning, on-chain Bitcoin, or other methods
 * specified by the merchant.
 *
 * Dependencies:
 *   npm install nostr-tools websocket-polyfill
 *
 * Run:
 *   npx ts-node marketplace.ts
 *
 * References:
 *   - NIP-15: https://github.com/nostr-protocol/nips/blob/master/15.md
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  verifyEvent,
  type Event,
} from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import * as nip44 from "nostr-tools/nip44";
import { bytesToHex } from "@noble/hashes/utils";
import "websocket-polyfill";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

// ---------------------------------------------------------------------------
// Types (NIP-15 data structures)
// ---------------------------------------------------------------------------

/** Shipping zone for a stall */
interface ShippingZone {
  id: string; // unique identifier for this zone
  name: string; // e.g. "Worldwide", "North America", "EU"
  cost: number; // base shipping cost in the stall's currency
  regions?: string[]; // ISO country codes or region names
}

/** Stall metadata — stored in kind 30017 content */
interface StallData {
  id: string; // unique stall identifier (matches "d" tag)
  name: string; // stall name
  description?: string; // stall description
  currency: string; // currency code: "sat", "USD", "EUR", etc.
  shipping: ShippingZone[]; // available shipping options
}

/** Product metadata — stored in kind 30018 content */
interface ProductData {
  id: string; // unique product identifier (matches "d" tag)
  stall_id: string; // which stall this product belongs to
  name: string; // product name
  description?: string; // product description
  images?: string[]; // array of image URLs
  currency: string; // currency code (should match stall)
  price: number; // price in the specified currency
  quantity: number; // available stock (0 = out of stock)
  specs?: Array<[string, string]>; // key-value specifications
  shipping: Array<{
    id: string; // shipping zone ID (from the stall)
    cost: number; // extra shipping cost for this product
  }>;
  categories?: string[]; // product categories
}

/** Order item in a purchase */
interface OrderItem {
  product_id: string;
  quantity: number;
}

/** Order message — sent as encrypted DM (kind 30019 content) */
interface OrderData {
  id: string; // unique order identifier (UUID)
  type: 0; // 0 = new order, 1 = payment-sent, 2 = order-update
  name?: string; // buyer's name for shipping
  address?: string; // shipping address
  message?: string; // message to seller
  contact: {
    nostr: string; // buyer's npub or hex pubkey
    phone?: string;
    email?: string;
  };
  items: OrderItem[];
  shipping_id: string; // which shipping zone to use
}

/** Payment request — seller responds with this */
interface PaymentRequest {
  id: string; // order ID
  type: 1; // payment request
  message?: string;
  payment_options: Array<{
    type: string; // "ln" (Lightning), "btc" (on-chain), "url"
    link: string; // bolt11 invoice, bitcoin address, or payment URL
  }>;
}

/** Order status update from seller */
interface OrderStatusUpdate {
  id: string; // order ID
  type: 2; // status update
  message?: string;
  paid: boolean;
  shipped: boolean;
}

// ---------------------------------------------------------------------------
// 1. Create a Stall (Kind 30017)
// ---------------------------------------------------------------------------

/**
 * Kind 30017 is a parameterized replaceable event representing a merchant's stall.
 * The "d" tag contains the stall ID, making each stall uniquely addressable.
 *
 * Tags:
 *   - ["d", "<stall-id>"]     — unique identifier (required)
 *   - ["t", "<tag>"]          — category/topic tags (optional)
 *
 * Content: JSON-serialized StallData
 */
function createStall(
  merchantSk: Uint8Array,
  stallData: StallData
): Event {
  console.log("=== Create Stall (Kind 30017) ===");

  const tags: string[][] = [
    // The "d" tag makes this a parameterized replaceable event.
    // Combined with the pubkey, it creates a unique address: 30017:<pubkey>:<stall-id>
    ["d", stallData.id],
    // Optional category tags for discoverability
    ["t", "marketplace"],
  ];

  const stallEvent = finalizeEvent(
    {
      kind: 30017,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: JSON.stringify(stallData),
    },
    merchantSk
  );

  console.log("  Stall ID:", stallData.id);
  console.log("  Name:", stallData.name);
  console.log("  Currency:", stallData.currency);
  console.log("  Shipping zones:", stallData.shipping.length);
  console.log("  Event ID:", stallEvent.id);
  console.log(
    "  Address:",
    `30017:${stallEvent.pubkey}:${stallData.id}`
  );

  return stallEvent;
}

// ---------------------------------------------------------------------------
// 2. List a Product (Kind 30018)
// ---------------------------------------------------------------------------

/**
 * Kind 30018 is a parameterized replaceable event representing a product listing.
 * Each product references a stall and contains pricing, images, and shipping info.
 *
 * Tags:
 *   - ["d", "<product-id>"]   — unique product identifier (required)
 *   - ["t", "<category>"]     — category tags for search (optional)
 *
 * Content: JSON-serialized ProductData
 */
function createProduct(
  merchantSk: Uint8Array,
  productData: ProductData
): Event {
  console.log("\n=== Create Product (Kind 30018) ===");

  const tags: string[][] = [
    ["d", productData.id],
    ["t", "marketplace"],
  ];

  // Add category tags for discoverability
  if (productData.categories) {
    for (const cat of productData.categories) {
      tags.push(["t", cat]);
    }
  }

  const productEvent = finalizeEvent(
    {
      kind: 30018,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: JSON.stringify(productData),
    },
    merchantSk
  );

  console.log("  Product ID:", productData.id);
  console.log("  Name:", productData.name);
  console.log("  Price:", productData.price, productData.currency);
  console.log("  Quantity:", productData.quantity);
  console.log("  Stall:", productData.stall_id);
  console.log("  Event ID:", productEvent.id);

  return productEvent;
}

// ---------------------------------------------------------------------------
// 3. Place an Order (Kind 30019 — Encrypted DM)
// ---------------------------------------------------------------------------

/**
 * Orders are sent as NIP-44 encrypted direct messages (kind 30019) from
 * the buyer to the merchant. This keeps order details (name, address)
 * private between buyer and seller.
 *
 * The order flow:
 *   1. Buyer sends type 0 (new order) to merchant
 *   2. Merchant responds with type 1 (payment request) with Lightning invoice
 *   3. Buyer pays and sends type 1 (payment-sent notification)
 *   4. Merchant sends type 2 (order status updates: paid, shipped)
 *
 * Tags:
 *   - ["p", "<merchant-pubkey>"]  — the merchant receiving the order
 *
 * Content: NIP-44 encrypted JSON (OrderData)
 */
function createOrder(
  buyerSk: Uint8Array,
  merchantPubkey: string,
  orderData: OrderData
): Event {
  console.log("\n=== Place Order (Kind 30019) ===");

  // Encrypt the order data using NIP-44
  const conversationKey = nip44.v2.utils.getConversationKey(
    buyerSk,
    merchantPubkey
  );
  const encryptedContent = nip44.v2.encrypt(
    JSON.stringify(orderData),
    conversationKey
  );

  const orderEvent = finalizeEvent(
    {
      kind: 30019,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", merchantPubkey],
      ],
      content: encryptedContent,
    },
    buyerSk
  );

  console.log("  Order ID:", orderData.id);
  console.log("  Buyer:", orderEvent.pubkey.slice(0, 16) + "...");
  console.log("  Merchant:", merchantPubkey.slice(0, 16) + "...");
  console.log("  Items:", orderData.items.length);
  for (const item of orderData.items) {
    console.log(`    - ${item.product_id} x${item.quantity}`);
  }
  console.log("  Shipping zone:", orderData.shipping_id);
  console.log("  Event ID:", orderEvent.id);
  console.log("  Content: (NIP-44 encrypted)");

  return orderEvent;
}

// ---------------------------------------------------------------------------
// 4. Merchant Responds with Payment Request
// ---------------------------------------------------------------------------

/**
 * The merchant decrypts the order, calculates the total (products + shipping),
 * and responds with a payment request containing a Lightning invoice.
 */
function createPaymentRequest(
  merchantSk: Uint8Array,
  buyerPubkey: string,
  orderId: string,
  bolt11Invoice: string,
  message?: string
): Event {
  console.log("\n=== Merchant Payment Request (Kind 30019) ===");

  const paymentRequest: PaymentRequest = {
    id: orderId,
    type: 1,
    message: message || "Please pay the following invoice to complete your order.",
    payment_options: [
      {
        type: "ln",
        link: bolt11Invoice,
      },
    ],
  };

  // Encrypt to the buyer
  const conversationKey = nip44.v2.utils.getConversationKey(
    merchantSk,
    buyerPubkey
  );
  const encryptedContent = nip44.v2.encrypt(
    JSON.stringify(paymentRequest),
    conversationKey
  );

  const responseEvent = finalizeEvent(
    {
      kind: 30019,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", buyerPubkey],
      ],
      content: encryptedContent,
    },
    merchantSk
  );

  console.log("  Order ID:", orderId);
  console.log("  Payment type: Lightning");
  console.log("  Invoice:", bolt11Invoice.slice(0, 40) + "...");
  console.log("  Event ID:", responseEvent.id);

  return responseEvent;
}

// ---------------------------------------------------------------------------
// 5. Merchant Sends Order Status Update
// ---------------------------------------------------------------------------

/**
 * The merchant sends status updates as the order progresses.
 */
function createOrderUpdate(
  merchantSk: Uint8Array,
  buyerPubkey: string,
  orderId: string,
  paid: boolean,
  shipped: boolean,
  message?: string
): Event {
  console.log("\n=== Order Status Update (Kind 30019) ===");

  const statusUpdate: OrderStatusUpdate = {
    id: orderId,
    type: 2,
    message: message || "",
    paid,
    shipped,
  };

  const conversationKey = nip44.v2.utils.getConversationKey(
    merchantSk,
    buyerPubkey
  );
  const encryptedContent = nip44.v2.encrypt(
    JSON.stringify(statusUpdate),
    conversationKey
  );

  const updateEvent = finalizeEvent(
    {
      kind: 30019,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", buyerPubkey],
      ],
      content: encryptedContent,
    },
    merchantSk
  );

  console.log("  Order ID:", orderId);
  console.log("  Paid:", paid);
  console.log("  Shipped:", shipped);
  if (message) console.log("  Message:", message);
  console.log("  Event ID:", updateEvent.id);

  return updateEvent;
}

// ---------------------------------------------------------------------------
// 6. Fetch Stalls and Products from Relays
// ---------------------------------------------------------------------------

/**
 * Queries relays for marketplace stalls and their products.
 * Can filter by merchant pubkey or browse all listings.
 */
async function fetchMarketplace(merchantPubkey?: string): Promise<void> {
  console.log("\n=== Fetching Marketplace Listings ===");
  if (merchantPubkey) {
    console.log("  Merchant:", merchantPubkey.slice(0, 16) + "...");
  }

  const pool = new SimplePool();

  try {
    // Build the filter for stalls
    const stallFilter: Record<string, unknown> = {
      kinds: [30017],
      limit: 20,
    };
    if (merchantPubkey) {
      stallFilter.authors = [merchantPubkey];
    }

    // Fetch stalls
    const stallEvents = await pool.querySync(
      RELAYS,
      stallFilter as any
    );

    console.log(`  Found ${stallEvents.length} stall(s)\n`);

    for (const stallEvent of stallEvents) {
      try {
        const stall: StallData = JSON.parse(stallEvent.content);
        console.log(`  --- Stall: ${stall.name} ---`);
        console.log(`    ID: ${stall.id}`);
        console.log(`    Currency: ${stall.currency}`);
        console.log(`    Merchant: ${stallEvent.pubkey.slice(0, 16)}...`);
        if (stall.description) {
          console.log(`    Description: ${stall.description.slice(0, 80)}`);
        }
        console.log(
          `    Shipping: ${stall.shipping.map((s) => s.name).join(", ")}`
        );

        // Fetch products for this stall
        const productEvents = await pool.querySync(RELAYS, {
          kinds: [30018],
          authors: [stallEvent.pubkey],
          limit: 50,
        });

        // Filter products belonging to this stall
        const stallProducts = productEvents.filter((pe) => {
          try {
            const product: ProductData = JSON.parse(pe.content);
            return product.stall_id === stall.id;
          } catch {
            return false;
          }
        });

        console.log(`    Products (${stallProducts.length}):`);
        for (const pe of stallProducts) {
          const product: ProductData = JSON.parse(pe.content);
          console.log(
            `      - ${product.name}: ${product.price} ${product.currency}` +
              ` (${product.quantity} in stock)`
          );
        }
        console.log();
      } catch (e) {
        console.log(`  [Error parsing stall ${stallEvent.id}]: ${e}`);
      }
    }
  } finally {
    pool.close(RELAYS);
  }
}

// ---------------------------------------------------------------------------
// Main — Demonstrate the full marketplace flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("Nostr Marketplace (NIP-15) Example");
  console.log("====================================\n");

  // Generate keypairs for demonstration
  const merchantSk = generateSecretKey();
  const merchantPk = getPublicKey(merchantSk);
  const buyerSk = generateSecretKey();
  const buyerPk = getPublicKey(buyerSk);

  console.log("Merchant:", merchantPk.slice(0, 16) + "...");
  console.log("Buyer:", buyerPk.slice(0, 16) + "...");

  // --- Step 1: Merchant creates a stall ---
  console.log("\n--- Step 1: Create Stall ---");

  const stallData: StallData = {
    id: "nostr-merch-001",
    name: "Nostr Merch Shop",
    description:
      "Physical and digital goods for the Nostr community. " +
      "All prices in sats. Lightning payments accepted.",
    currency: "sat",
    shipping: [
      {
        id: "ship-worldwide",
        name: "Worldwide Shipping",
        cost: 5000, // 5000 sats base shipping
        regions: ["worldwide"],
      },
      {
        id: "ship-digital",
        name: "Digital Delivery",
        cost: 0, // free for digital goods
      },
    ],
  };

  const stallEvent = createStall(merchantSk, stallData);

  // --- Step 2: List products ---
  console.log("\n--- Step 2: List Products ---");

  const tshirtData: ProductData = {
    id: "product-tshirt-001",
    stall_id: "nostr-merch-001",
    name: "Nostr Protocol T-Shirt",
    description:
      "Premium cotton t-shirt with the Nostr logo. " +
      "Available in S, M, L, XL.",
    images: [
      "https://example.com/nostr-tshirt-front.jpg",
      "https://example.com/nostr-tshirt-back.jpg",
    ],
    currency: "sat",
    price: 21000, // 21,000 sats
    quantity: 50,
    specs: [
      ["material", "100% organic cotton"],
      ["sizes", "S, M, L, XL"],
      ["color", "purple"],
    ],
    shipping: [
      { id: "ship-worldwide", cost: 2000 }, // extra 2000 sats for this item
    ],
    categories: ["clothing", "nostr"],
  };

  const tshirtEvent = createProduct(merchantSk, tshirtData);

  const stickerData: ProductData = {
    id: "product-stickers-001",
    stall_id: "nostr-merch-001",
    name: "Nostr Sticker Pack (10 stickers)",
    description:
      "Vinyl stickers featuring Nostr memes and logos. " +
      "Waterproof, UV-resistant.",
    images: ["https://example.com/nostr-stickers.jpg"],
    currency: "sat",
    price: 5000, // 5,000 sats
    quantity: 200,
    shipping: [
      { id: "ship-worldwide", cost: 1000 },
    ],
    categories: ["stickers", "nostr"],
  };

  const stickerEvent = createProduct(merchantSk, stickerData);

  const ebookData: ProductData = {
    id: "product-ebook-001",
    stall_id: "nostr-merch-001",
    name: "Understanding Nostr (ebook, PDF)",
    description:
      "A comprehensive guide to the Nostr protocol, " +
      "event kinds, NIPs, and building clients.",
    images: ["https://example.com/nostr-ebook-cover.jpg"],
    currency: "sat",
    price: 10000, // 10,000 sats
    quantity: 999, // digital — unlimited
    shipping: [
      { id: "ship-digital", cost: 0 }, // digital delivery
    ],
    categories: ["books", "digital", "nostr"],
  };

  const ebookEvent = createProduct(merchantSk, ebookData);

  // --- Step 3: Buyer places an order ---
  console.log("\n--- Step 3: Place Order ---");

  const orderData: OrderData = {
    id: "order-" + bytesToHex(generateSecretKey()).slice(0, 16),
    type: 0, // new order
    name: "Satoshi Nakamoto",
    address: "1 Lightning Lane, Bitcoin City, BTC 21000",
    message: "Please include extra stickers if possible!",
    contact: {
      nostr: buyerPk,
      email: "satoshi@example.com",
    },
    items: [
      { product_id: "product-tshirt-001", quantity: 1 },
      { product_id: "product-stickers-001", quantity: 2 },
    ],
    shipping_id: "ship-worldwide",
  };

  const orderEvent = createOrder(buyerSk, merchantPk, orderData);

  // --- Step 4: Merchant responds with payment request ---
  console.log("\n--- Step 4: Merchant Sends Payment Request ---");

  // Merchant calculates total:
  // T-shirt: 21,000 + 2,000 shipping = 23,000 sats
  // Stickers x2: 5,000 x 2 + 1,000 shipping = 11,000 sats
  // Base shipping: 5,000 sats
  // Total: 39,000 sats
  const totalSats = 39000;
  console.log("  Calculated total:", totalSats, "sats");

  const paymentEvent = createPaymentRequest(
    merchantSk,
    buyerPk,
    orderData.id,
    "lnbc390u1pj...example_bolt11_invoice...",
    `Total: ${totalSats} sats (products + shipping). Pay within 24h.`
  );

  // --- Step 5: Order status updates ---
  console.log("\n--- Step 5: Order Status Updates ---");

  // After buyer pays
  const paidUpdate = createOrderUpdate(
    merchantSk,
    buyerPk,
    orderData.id,
    true,
    false,
    "Payment received! Preparing your order."
  );

  // After shipping
  const shippedUpdate = createOrderUpdate(
    merchantSk,
    buyerPk,
    orderData.id,
    true,
    true,
    "Your order has been shipped! Tracking: NOSTR123456"
  );

  // --- Step 6: Browse the marketplace ---
  console.log("\n--- Step 6: Browse Marketplace ---");
  await fetchMarketplace();

  // --- Summary ---
  console.log("\n--- Summary ---");
  console.log(`  Stall:       ${stallEvent.id.slice(0, 16)}... (${stallData.name})`);
  console.log(`  Products:    ${tshirtEvent.id.slice(0, 16)}..., ${stickerEvent.id.slice(0, 16)}..., ${ebookEvent.id.slice(0, 16)}...`);
  console.log(`  Order:       ${orderEvent.id.slice(0, 16)}... (${orderData.id})`);
  console.log(`  Payment req: ${paymentEvent.id.slice(0, 16)}...`);
  console.log(`  Updates:     ${paidUpdate.id.slice(0, 16)}..., ${shippedUpdate.id.slice(0, 16)}...`);

  console.log("\nDone.");
}

main().catch(console.error);
