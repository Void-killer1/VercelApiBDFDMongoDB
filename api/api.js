import { MongoClient, ObjectId } from 'mongodb';

export default async function handler(req, res) {
  // CORS ve Header Ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mongodb-uri');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const mongoUri = req.headers['x-mongodb-uri'];
  const { db, col, action, id } = req.query;

  if (!mongoUri) {
    return res.status(400).json({ error: "Eksik Header: x-mongodb-uri bulunamadı." });
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const database = client.db(db || 'test');
    const collection = database.collection(col || 'items');

    switch (req.method) {
      case 'GET':
        if (action === 'stats') {
          // Depolama alanı ve istatistik görüntüleme
          const stats = await database.command({ dbStats: 1 });
          return res.status(200).json({
            status: "success",
            storage: {
              used_mb: (stats.storageSize / 1024 / 1024).toFixed(2),
              data_size_mb: (stats.dataSize / 1024 / 1024).toFixed(2),
              objects: stats.objects
            }
          });
        }
        // Tüm veriyi listeleme (Raw/JSON)
        const docs = await collection.find({}).limit(500).toArray();
        return res.status(200).json(docs);

      case 'POST':
        // Yeni veri ekleme
        const newDoc = await collection.insertOne(req.body);
        return res.status(201).json(newDoc);

      case 'PUT':
        // Veri güncelleme
        if (!id) return res.status(400).json({ error: "Güncelleme için ?id=... gerekli." });
        const updated = await collection.updateOne(
          { _id: new ObjectId(id) },
          { $set: req.body }
        );
        return res.status(200).json(updated);

      case 'DELETE':
        // Veri silme
        if (!id) return res.status(400).json({ error: "Silme işlemi için ?id=... gerekli." });
        const deleted = await collection.deleteOne({ _id: new ObjectId(id) });
        return res.status(200).json(deleted);

      default:
        return res.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    await client.close();
  }
}
