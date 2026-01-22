const mongoose = require('mongoose');

export default async function handler(req, res) {
    // CORS & Güvenlik Ayarları
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { mongoUri, userId, view, action, field, amount } = req.query;

    if (!mongoUri) return res.status(400).json({ error: "Kritik: mongoUri eksik!" });

    let connection;
    try {
        // 1. Gelişmiş Bağlantı Yönetimi
        connection = await mongoose.createConnection(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            family: 4 // IPv4 zorlaması (bazı ağlarda hız kazandırır)
        }).asPromise();

        const DynamicSchema = new mongoose.Schema({}, { strict: false, versionKey: false, collection: 'UserData' });
        const Model = connection.model('Data', DynamicSchema);

        // --- ÖZELLİK 1: VERİ ÇEKME VE FİLTRELEME (GET) ---
        if (req.method === 'GET') {
            if (userId) {
                const data = await Model.findOne({ userId });
                return res.status(200).json(data || { exists: false, message: "Kullanıcı bulunamadı" });
            }

            // Sayfalama ve Limit desteği
            const limit = parseInt(req.query.limit) || 100;
            const allUsers = await Model.find({}).limit(limit).sort({ points: -1 }); // Otomatik Puan Sıralı

            if (view === 'raw') return res.status(200).json(allUsers);

            const stats = await connection.db.command({ dbStats: 1 });
            return res.status(200).json({
                status: "Online",
                database: stats.db,
                storage: {
                    used: (stats.dataSize / 1024).toFixed(2) + " KB",
                    objects: stats.objects,
                    avgObjSize: stats.avgObjSize + " bytes"
                },
                users: allUsers
            });
        }

        // --- ÖZELLİK 2: GELİŞMİŞ VERİ MANİPÜLASYONU (POST) ---
        if (req.method === 'POST') {
            const bodyData = { ...req.query, ...req.body };
            delete bodyData.mongoUri;
            if (!bodyData.userId) throw new Error("userId parametresi zorunludur.");

            // Sayısal Değerleri Otomatik Düzelte (Sıralama hatasını önler)
            for (let key in bodyData) {
                if (!isNaN(bodyData[key]) && bodyData[key] !== "") {
                    bodyData[key] = Number(bodyData[key]);
                }
            }

            // Özel Aksiyon: Matematiksel Artırma (Örn: Puan Ekleme)
            if (action === 'add' && field && amount) {
                const incUpdate = await Model.findOneAndUpdate(
                    { userId: bodyData.userId },
                    { $inc: { [field]: Number(amount) } },
                    { upsert: true, new: true }
                );
                return res.status(200).json({ success: true, updated: incUpdate });
            }

            // Standart Güncelleme
            const updated = await Model.findOneAndUpdate(
                { userId: bodyData.userId },
                { $set: bodyData },
                { upsert: true, new: true }
            );
            return res.status(200).json({ success: true, data: updated });
        }

        // --- ÖZELLİK 3: VERİ SİLME (DELETE) ---
        if (req.method === 'DELETE') {
            if (userId === 'ALL_DATA_RESET_CONFIRM') {
                await Model.deleteMany({});
                return res.status(200).json({ success: true, message: "Tüm veritabanı sıfırlandı." });
            }
            const result = await Model.deleteOne({ userId });
            return res.status(200).json({ success: true, deletedCount: result.deletedCount });
        }

    } catch (err) {
        // --- ÖZELLİK 4: 360 DERECE HATA TEŞHİSİ ---
        const errorResponse = {
            error: true,
            type: err.name,
            msg: err.message,
            diagnosis: "Bilinmeyen sistem hatası."
        };

        if (err.message.includes("bad auth")) {
            errorResponse.diagnosis = "MongoDB kullanıcı adı veya şifresi yanlış.";
        } else if (err.code === "ETIMEOUT" || err.message.includes("timeout")) {
            errorResponse.diagnosis = "Bağlantı zaman aşımına uğradı. IP izni (0.0.0.0/0) eksik olabilir.";
        } else if (err.message.includes("is not a valid") || err.name === "BSONError") {
            errorResponse.diagnosis = "MongoDB URL formatı bozuk veya geçersiz karakter içeriyor.";
        }

        return res.status(500).json(errorResponse);
    } finally {
        if (connection) await connection.close();
    }
}
