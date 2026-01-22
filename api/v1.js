const mongoose = require('mongoose');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { mongoUri, userId, view } = req.query;

    // 1. AŞAMA: URL BOŞ MU?
    if (!mongoUri) {
        return res.status(400).json({
            hata_tipi: "Girdi Hatası",
            mesaj: "MongoDB Bağlantı adresi (mongoUri) bulunamadı.",
            cozum: "Lütfen komutunuza ?mongoUri=... parametresini ekleyin."
        });
    }

    // 2. AŞAMA: URL FORMATI DOĞRU MU?
    if (!mongoUri.startsWith("mongodb")) {
        return res.status(400).json({
            hata_tipi: "Format Hatası",
            mesaj: "Geçersiz MongoDB URL formatı.",
            detay: "URL 'mongodb://' veya 'mongodb+srv://' ile başlamalıdır.",
            senin_yazdigin: mongoUri.substring(0, 15) + "..."
        });
    }

    let connection;
    try {
        // Bağlantı denemesi (Zaman aşımı süresini kısa tuttuk ki bot takılmasın)
        connection = await mongoose.createConnection(mongoUri, {
            serverSelectionTimeoutMS: 5000, 
            connectTimeoutMS: 5000
        }).asPromise();

        const Model = connection.model('Data', new mongoose.Schema({}, { strict: false, collection: 'UserData' }));

        if (req.method === 'GET') {
            if (userId) {
                const data = await Model.findOne({ userId });
                if (!data) return res.status(200).json({ exists: false, mesaj: "Kayıtlı veri yok." });
                return res.status(200).json(data);
            }
            const allUsers = await Model.find({}).limit(100);
            if (view === 'raw') return res.status(200).json(allUsers);
            
            const stats = await connection.db.command({ dbStats: 1 });
            return res.status(200).json({ storage: stats, users: allUsers });
        }

        if (req.method === 'POST') {
            const combinedData = { ...req.query, ...req.body };
            delete combinedData.mongoUri;
            if (!combinedData.userId) throw new Error("POST işleminde userId zorunludur.");
            
            const updated = await Model.findOneAndUpdate(
                { userId: combinedData.userId },
                { $set: combinedData },
                { upsert: true, new: true }
            );
            return res.status(200).json({ success: true, data: updated });
        }

    } catch (err) {
        // 3. AŞAMA: DERİN HATA ANALİZİ
        let rapor = {
            hata_tipi: "Bağlantı/Sistem Hatası",
            teknik_kod: err.code || "Özel Hata",
            mesaj: err.message,
            teshis: "Bilinmeyen bir hata oluştu."
        };

        if (err.message.includes("bad auth") || err.message.includes("Authentication failed")) {
            rapor.teshis = "MongoDB Kullanıcı adı veya Şifre hatalı!";
            rapor.cozum = "Database Access kısmından şifreyi sıfırlayın ve URL'yi güncelleyin.";
        } 
        else if (err.message.includes("ETIMEOUT") || err.message.includes("selection timeout")) {
            rapor.teshis = "Sunucuya ulaşılamıyor (Zaman Aşımı).";
            rapor.cozum = "MongoDB Atlas > Network Access kısmından IP iznini 0.0.0.0/0 (Erişilebilir) yapın.";
        }
        else if (err.message.includes("ENOTFOUND")) {
            rapor.teshis = "Cluster adresi hatalı.";
            rapor.cozum = "MongoDB URL'sindeki host kısmını (cluster0.xxx.mongodb.net) kontrol edin.";
        }
        else if (err.message.includes("invalid driver option")) {
            rapor.teshis = "URL parametreleri hatalı.";
            rapor.cozum = "URL sonundaki ?authSource=admin gibi kısımları kontrol edin.";
        }

        return res.status(500).json(rapor);

    } finally {
        if (connection) await connection.close();
    }
}
