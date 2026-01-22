const mongoose = require('mongoose');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    // Kullanıcının gönderdiği MongoDB URL'si ve İşlem yapılacak UserID
    const { mongoUri, userId, points, level } = req.query;

    if (!mongoUri) {
        return res.status(400).json({ error: "Lütfen bir 'mongoUri' parametresi gönderin!" });
    }

    try {
        // Her istekte farklı bir bağlantı oluştur (Public API mantığı)
        const conn = await mongoose.createConnection(mongoUri).asPromise();
        
        // Dinamik Şema
        const DataSchema = new mongoose.Schema({
            userId: String,
            points: { type: Number, default: 0 },
            level: { type: Number, default: 1 }
        }, { strict: false });

        const DataModel = conn.model('Data', DataSchema);

        if (req.method === 'GET') {
            const data = await DataModel.findOne({ userId });
            await conn.close(); // Bağlantıyı kapat
            return res.status(200).json(data || { exists: false, message: "Kayıt bulunamadı" });
        }

        if (req.method === 'POST') {
            const updated = await DataModel.findOneAndUpdate(
                { userId },
                { $set: { points: Number(points), level: Number(level) } },
                { upsert: true, new: true }
            );
            await conn.close();
            return res.status(200).json({ success: true, updated });
        }

    } catch (err) {
        return res.status(500).json({ error: "Bağlantı Hatası: " + err.message });
    }
}
