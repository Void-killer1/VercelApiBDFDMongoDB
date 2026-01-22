const mongoose = require('mongoose');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { mongoUri, userId, view } = req.query;

    if (!mongoUri) {
        return res.status(400).json({ error: "Eksik mongoUri parametresi!" });
    }

    let connection;
    try {
        connection = await mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
        const Model = connection.model('Data', new mongoose.Schema({}, { strict: false, collection: 'UserData' }));

        // GET İŞLEMİ
        if (req.method === 'GET') {
            if (userId) {
                const data = await Model.findOne({ userId });
                return res.status(200).json(data || { exists: false });
            }

            const allUsers = await Model.find({}).limit(100);

            // --- SEÇENEK: HAM VERİ GÖSTERİMİ ---
            if (view === 'raw') {
                // Sadece JSON dizisini döndürür (Başında "storage" falan olmaz)
                return res.status(200).json(allUsers);
            }

            // Normal detaylı görünüm
            const stats = await connection.db.command({ dbStats: 1 });
            return res.status(200).json({
                storage: {
                    kullanilan: (stats.dataSize / (1024 * 1024)).toFixed(2) + " MB",
                    kayit_sayisi: stats.objects
                },
                users: allUsers
            });
        }

        // POST İŞLEMİ (KAYDETME)
        if (req.method === 'POST') {
            const combinedData = { ...req.query, ...req.body };
            delete combinedData.mongoUri;
            delete combinedData.view;

            if (!combinedData.userId) throw new Error("userId zorunludur!");
            const updated = await Model.findOneAndUpdate(
                { userId: combinedData.userId },
                { $set: combinedData },
                { upsert: true, new: true }
            );
            return res.status(200).json({ success: true, updated });
        }

    } catch (err) {
        return res.status(500).json({ error: "Hata", detay: err.message });
    } finally {
        if (connection) await connection.close();
    }
}
