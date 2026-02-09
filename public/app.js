require("dotenv").config(); // ⬅️ ВАЖНО: первым

const express = require("express");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;

const DB_NAME = "shop";
const COLLECTION_NAME = "products";

let productsCollection;
let mongoClient;

app.use(express.json());

// Логгер
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

// Подключение к MongoDB Atlas + запуск сервера
async function startServer() {
  try {
    console.log("⏳ Connecting to MongoDB Atlas...");

    mongoClient = new MongoClient(MONGO_URL, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await mongoClient.connect();
    console.log("✅ MongoClient connected");

    await mongoClient.db("admin").command({ ping: 1 });
    console.log("✅ Ping successful");

    const db = mongoClient.db(DB_NAME);
    productsCollection = db.collection(COLLECTION_NAME);

    console.log(`✅ Using database "${DB_NAME}", collection "${COLLECTION_NAME}"`);

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

startServer();

/* ---------- ROUTES ---------- */

app.get("/", (req, res) => {
  res.send(`
    <h1>Practice Task 9</h1>
    <ul>
      <li><a href="/api/products">/api/products</a></li>
    </ul>
  `);
});

app.get("/api/products", async (req, res) => {
  try {
    const products = await productsCollection.find().toArray();
    res.json({ count: products.length, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  const product = await productsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json(product);
});

app.post("/api/products", async (req, res) => {
  const { name, price, category } = req.body;

  if (!name || !price || !category) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const result = await productsCollection.insertOne({
    name,
    price,
    category,
  });

  res.status(201).json({
    message: "Product created",
    id: result.insertedId,
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});
